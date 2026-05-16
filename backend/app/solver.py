from typing import Any, cast

import pulp
import pandas as pd


EPSILON = 1e-6


class OptimizationEngine:
    def __init__(self, products_data, facilities_data, routing_data):
        # Convert JSON/Dict lists to Pandas dataframes for easy lookups
        # This can be SAP data or any other source
        self.products = pd.DataFrame(products_data).set_index('id')
        self.facilities = pd.DataFrame(facilities_data).set_index('id')
        self.routes = pd.DataFrame(routing_data).set_index(['facility_id', 'product_id'])

        # Pre-compute critical metrics based on raw data
        self._calculate_margins_and_emissions()

    def _calculate_margins_and_emissions(self):
        """Translate raw data (Price, Cost, kWh, Grid factor) into modeling numbers."""
        self.routes['margin'] = 0.0
        self.routes['production_energy_emissions_kg'] = 0.0
        self.routes['emissions_kg'] = 0.0

        if "purchased_input_emissions_kg_per_unit" not in self.routes.columns:
            self.routes["purchased_input_emissions_kg_per_unit"] = 0.0

        purchased_input_emissions = cast(
            pd.Series,
            pd.to_numeric(
                self.routes["purchased_input_emissions_kg_per_unit"],
                errors='coerce',
            ),
        )
        self.routes["purchased_input_emissions_kg_per_unit"] = (
            purchased_input_emissions.fillna(0.0)
        )

        for index, row in self.routes.iterrows():
            f_id, p_id = self._route_tuple(index)
            # Margin = Selling Price - Variable Cost to build it at that factory
            price = self._value(self.products.loc[p_id, 'price_usd'])
            variable_cost = self._value(row['variable_cost_usd'])
            self.routes.loc[index, 'margin'] = price - variable_cost

            # Emissions = Energy used per unit * Factory's local energy grid dirtiness
            # + product-attributable Scope 3 emissions from purchased inputs.
            grid_factor = self._value(self.facilities.loc[f_id, 'grid_emissions_factor'])
            kwh_per_unit = self._value(row['kwh_per_unit'])
            purchased_input_emissions = self._value(row["purchased_input_emissions_kg_per_unit"])
            production_energy_emissions = kwh_per_unit * grid_factor
            self.routes.loc[index, 'production_energy_emissions_kg'] = production_energy_emissions
            self.routes.loc[index, 'emissions_kg'] = production_energy_emissions + purchased_input_emissions

    def solve(self, policy_constraints):
        """
        Executes the optimization.
        policy_constraints is a dict like: {"carbon_cap_kg": 500000}
        """
        policy_constraints = policy_constraints or {}
        carbon_cap = policy_constraints.get("carbon_cap_kg")

        demand_plan = self._solve_protect_demand(policy_constraints)
        compliance_plan = None
        has_compliance_gap = (
            demand_plan["status"] == "Optimal"
            and carbon_cap is not None
            and self._is_positive(demand_plan.get("carbon_overage_kg"))
        )

        if carbon_cap is not None and has_compliance_gap:
            compliance_plan = self._solve_protect_compliance(policy_constraints)

        if demand_plan["status"] != "Optimal":
            decision_status = "infeasible"
        elif has_compliance_gap:
            decision_status = "tradeoff_required"
        else:
            decision_status = "optimal"

        tradeoff_summary = None
        if compliance_plan is not None:
            tradeoff_summary = {
                "message": "The carbon cap cannot be met while fulfilling all demand under current constraints.",
                "carbon_gap_kg_if_demand_protected": demand_plan["carbon_overage_kg"],
                "unmet_demand_units_if_compliance_protected": compliance_plan["unmet_demand_total_units"],
                "profit_delta_usd_if_compliance_protected": self._round(
                    compliance_plan["total_profit_usd"] - demand_plan["total_profit_usd"]
                ),
            }

        return {
            "status": demand_plan["status"],
            "decision_status": decision_status,
            "carbon_cap_kg": self._round(carbon_cap),
            "has_compliance_gap": has_compliance_gap,
            "plans": {
                "protect_demand": demand_plan,
                "protect_compliance": compliance_plan,
            },
            "tradeoff_summary": tradeoff_summary,
        }

    def _solve_protect_demand(self, policy_constraints):
        model = pulp.LpProblem("ProtectDemandOptimizer", pulp.LpMaximize)
        x = self._production_variables()
        carbon_overage = pulp.LpVariable("Carbon_Overage_Kg", lowBound=0, cat=pulp.LpContinuous)

        total_profit = self._total_profit(x)
        total_emissions = self._total_emissions(x)
        carbon_penalty = policy_constraints.get("carbon_penalty_usd_per_kg", self._default_carbon_penalty())

        model += total_profit - carbon_penalty * carbon_overage, "Penalty_Adjusted_Objective"
        self._add_exact_demand_constraints(model, x)
        self._add_capacity_constraints(model, x, policy_constraints)

        carbon_cap = policy_constraints.get("carbon_cap_kg")
        if carbon_cap is not None:
            model += total_emissions <= carbon_cap + carbon_overage, "Soft_Global_Carbon_Cap"

        model.solve(pulp.PULP_CBC_CMD(msg=False))

        carbon_overage_kg = self._value(carbon_overage.varValue)
        relaxed_constraints = []
        if self._is_positive(carbon_overage_kg):
            relaxed_constraints.append({
                "constraint_name": "Global_Carbon_Cap",
                "type": "carbon_cap",
                "relaxed_by_kg": self._round(carbon_overage_kg),
            })

        return self._format_plan(
            model=model,
            x_vars=x,
            mode="protect_demand",
            total_profit=total_profit,
            total_emissions=total_emissions,
            carbon_overage_kg=carbon_overage_kg,
            demand_shortfalls=None,
            relaxed_constraints=relaxed_constraints,
            objective_value=pulp.value(model.objective),
        )

    def _solve_protect_compliance(self, policy_constraints):
        model = pulp.LpProblem("ProtectComplianceOptimizer", pulp.LpMaximize)
        x = self._production_variables()
        unmet_demand = pulp.LpVariable.dicts(
            "Unmet_Demand",
            self.products.index,
            lowBound=0,
            cat=pulp.LpContinuous,
        )

        total_profit = self._total_profit(x)
        total_emissions = self._total_emissions(x)
        unmet_penalty = policy_constraints.get(
            "unmet_demand_penalty_usd_per_unit",
            self._default_unmet_demand_penalty(),
        )

        model += (
            total_profit
            - pulp.lpSum(unmet_penalty * unmet_demand[p_id] for p_id in self.products.index)
        ), "Demand_Adjusted_Objective"

        for p_id in self.products.index:
            valid_routes = self._routes_for_product(p_id)
            demand = self._demand_for_product(p_id)
            model += (
                pulp.lpSum(x[route] for route in valid_routes) + unmet_demand[p_id] == demand
            ), f"Soft_Demand_{p_id}"

        self._add_capacity_constraints(model, x, policy_constraints)

        carbon_cap = policy_constraints.get("carbon_cap_kg")
        if carbon_cap is not None:
            model += total_emissions <= carbon_cap, "Hard_Global_Carbon_Cap"

        model.solve(pulp.PULP_CBC_CMD(msg=False))

        demand_shortfalls = {
            p_id: self._value(unmet_demand[p_id].varValue)
            for p_id in self.products.index
        }
        relaxed_constraints = [
            {
                "constraint_name": f"Demand_{p_id}",
                "type": "demand",
                "product_id": p_id,
                "relaxed_by_units": self._round(units),
            }
            for p_id, units in demand_shortfalls.items()
            if self._is_positive(units)
        ]

        return self._format_plan(
            model=model,
            x_vars=x,
            mode="protect_compliance",
            total_profit=total_profit,
            total_emissions=total_emissions,
            carbon_overage_kg=0,
            demand_shortfalls=demand_shortfalls,
            relaxed_constraints=relaxed_constraints,
            objective_value=pulp.value(model.objective),
        )

    def _production_variables(self):
        return pulp.LpVariable.dicts(
            "Production",
            self.routes.index,
            lowBound=0,
            cat=pulp.LpContinuous,
        )

    def _total_profit(self, x_vars):
        return pulp.lpSum(
            self._route_value(route, 'margin') * x_vars[route]
            for route in self.routes.index
        )

    def _total_emissions(self, x_vars):
        return pulp.lpSum(
            self._route_value(route, 'emissions_kg') * x_vars[route]
            for route in self.routes.index
        )

    def _add_exact_demand_constraints(self, model, x_vars):
        for p_id in self.products.index:
            valid_routes = self._routes_for_product(p_id)
            model += (
                pulp.lpSum(x_vars[route] for route in valid_routes) == self._demand_for_product(p_id)
            ), f"Demand_{p_id}"

    def _add_capacity_constraints(self, model, x_vars, policy_constraints):
        capacity_multiplier = 1 + self._value(policy_constraints.get("max_overtime_pct", 0)) / 100
        facility_capacity_multipliers = policy_constraints.get("facility_capacity_multipliers", {})

        for f_id in self.facilities.index:
            valid_routes = self._routes_for_facility(f_id)
            facility_multiplier = self._value(facility_capacity_multipliers.get(f_id, 1))
            base_hours = self._value(self.facilities.loc[f_id, 'max_operating_hours'])
            max_hours = (
                base_hours * capacity_multiplier * facility_multiplier
            )
            model += (
                pulp.lpSum(
                    x_vars[route] * self._route_value(route, 'hours_per_unit')
                    for route in valid_routes
                ) <= max_hours
            ), f"Capacity_{f_id}"

    def _routes_for_product(self, product_id):
        return [
            route
            for route in self.routes.index
            if self._route_tuple(route)[1] == product_id
        ]

    def _routes_for_facility(self, facility_id):
        return [
            route
            for route in self.routes.index
            if self._route_tuple(route)[0] == facility_id
        ]

    def _demand_for_product(self, product_id):
        return self._value(self.products.loc[product_id, 'min_demand'])

    def _default_carbon_penalty(self):
        max_margin = max(self._value(margin) for margin in self.routes['margin'])
        max_emissions = max(self._value(emissions) for emissions in self.routes['emissions_kg'])
        if max_emissions <= 0:
            return max(max_margin, 1)
        return max(max_margin / max_emissions, 1) * self._total_demand_units() + 1

    def _default_unmet_demand_penalty(self):
        max_margin = max(self._value(margin) for margin in self.routes['margin'])
        return max(max_margin, 1) * self._total_demand_units() + 1

    def _total_demand_units(self):
        return sum(self._demand_for_product(p_id) for p_id in self.products.index)

    def _format_plan(
        self,
        model,
        x_vars,
        mode,
        total_profit,
        total_emissions,
        carbon_overage_kg,
        demand_shortfalls,
        relaxed_constraints,
        objective_value,
    ):
        solver_status = pulp.LpStatus[model.status]
        if solver_status != "Optimal":
            return {
                "mode": mode,
                "status": solver_status,
                "error": "Problem is infeasible with current hard constraints.",
            }

        total_demand = self._total_demand_units()
        demand_shortfalls = demand_shortfalls or {
            p_id: 0
            for p_id in self.products.index
        }
        unmet_demand_total = sum(demand_shortfalls.values())
        demand_met_units = total_demand - unmet_demand_total

        return {
            "mode": mode,
            "status": "Optimal",
            "total_profit_usd": self._round(pulp.value(total_profit)),
            "optimization_objective_value": self._round(objective_value),
            "total_emissions_kg": self._round(pulp.value(total_emissions)),
            "carbon_overage_kg": self._round(carbon_overage_kg),
            "demand_met_units": self._round(demand_met_units),
            "total_demand_units": self._round(total_demand),
            "demand_met_pct": self._round((demand_met_units / total_demand) * 100 if total_demand else 100),
            "unmet_demand_total_units": self._round(unmet_demand_total),
            "demand_shortfalls": [
                {
                    "product_id": p_id,
                    "unmet_units": self._round(units),
                }
                for p_id, units in demand_shortfalls.items()
                if self._is_positive(units)
            ],
            "relaxed_constraints": relaxed_constraints,
            "production_plan": self._format_allocations(x_vars),
            "binding_constraints": self._format_binding_constraints(model),
        }

    def _format_allocations(self, x_vars):
        allocations = []
        for route in self.routes.index:
            facility_id, product_id = self._route_tuple(route)
            units = self._value(x_vars[route].varValue)
            if self._is_positive(units):
                allocations.append({
                    "facility_id": facility_id,
                    "product_id": product_id,
                    "units_assigned": self._round(units),
                    "profit_usd": self._round(units * self._route_value(route, 'margin')),
                    "emissions_kg": self._round(units * self._route_value(route, 'emissions_kg')),
                    "production_energy_emissions_kg": self._round(
                        units * self._route_value(route, 'production_energy_emissions_kg')
                    ),
                    "purchased_input_emissions_kg": self._round(
                        units * self._route_value(route, "purchased_input_emissions_kg_per_unit")
                    ),
                    "emissions_kg_per_unit": self._round(self._route_value(route, 'emissions_kg')),
                    "production_energy_emissions_kg_per_unit": self._round(
                        self._route_value(route, 'production_energy_emissions_kg')
                    ),
                    "purchased_input_emissions_kg_per_unit": self._round(
                        self._route_value(route, "purchased_input_emissions_kg_per_unit")
                    ),
                })
        return allocations

    def _format_binding_constraints(self, model):
        constraints = []
        for name, constraint in model.constraints.items():
            slack = self._value(constraint.slack)
            marginal_value = self._value(constraint.pi)
            if abs(slack) <= EPSILON or abs(marginal_value) > EPSILON:
                constraints.append({
                    "constraint_name": name,
                    "slack": self._round(slack),
                    "marginal_value": self._round(marginal_value),
                })
        return constraints

    def _round(self, value):
        if value is None:
            return None
        return round(self._value(value), 2)

    def _route_value(self, route, column):
        return self._value(self.routes.loc[route, column])

    def _route_tuple(self, route):
        return cast(tuple[Any, Any], route)

    def _value(self, value):
        if value is None:
            return 0
        return float(value)

    def _is_positive(self, value):
        return self._value(value) > EPSILON
