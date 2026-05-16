import unittest

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


class OptimizerApiTest(unittest.TestCase):
    def test_demo_data_returns_full_demo_dataset(self):
        response = client.get("/api/optimizer/demo-data")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["products"]), 8)
        self.assertEqual(len(data["facilities"]), 5)
        self.assertEqual(len(data["routes"]), 40)

    def test_solve_returns_solver_contract(self):
        response = client.post(
            "/api/optimizer/solve",
            json={
                "dataset_id": "demo",
                "scenario": {
                    "carbon_cap_kg": 500_000_000,
                    "max_overtime_pct": 10,
                    "facility_capacity_multipliers": {"factory_3": 0.7},
                    "demand_multiplier": 1,
                    "carbon_penalty_usd_per_kg": None,
                    "unmet_demand_penalty_usd_per_unit": None,
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("decision_status", data)
        self.assertIn("plans", data)
        self.assertIn("protect_demand", data["plans"])
        self.assertEqual(data["plans"]["protect_demand"]["status"], "Optimal")

    def test_demand_multiplier_changes_total_demand_units(self):
        base_response = self._solve(demand_multiplier=1)
        surge_response = self._solve(demand_multiplier=1.15)

        base_demand = base_response["plans"]["protect_demand"]["total_demand_units"]
        surge_demand = surge_response["plans"]["protect_demand"]["total_demand_units"]

        self.assertGreater(surge_demand, base_demand)
        self.assertAlmostEqual(surge_demand, round(base_demand * 1.15, 2), places=2)

    def test_tight_cap_produces_tradeoff_required(self):
        data = self._solve(carbon_cap_kg=50_000_000)

        self.assertEqual(data["decision_status"], "tradeoff_required")
        self.assertGreater(data["plans"]["protect_demand"]["carbon_overage_kg"], 0)
        self.assertIsNotNone(data["plans"]["protect_compliance"])

    def test_pareto_uses_protect_demand_as_top_level_point(self):
        response = client.post(
            "/api/optimizer/pareto",
            json={
                "dataset_id": "demo",
                "scenario": {
                    "max_overtime_pct": 10,
                    "facility_capacity_multipliers": {"factory_3": 0.7},
                    "demand_multiplier": 1,
                    "carbon_penalty_usd_per_kg": None,
                    "unmet_demand_penalty_usd_per_unit": None,
                },
                "carbon_cap_kg_points": [50_000_000, 500_000_000],
            },
        )

        self.assertEqual(response.status_code, 200)
        points = response.json()["points"]
        self.assertEqual(len(points), 2)

        tight_point = points[0]
        self.assertEqual(tight_point["decision_status"], "tradeoff_required")
        self.assertGreater(tight_point["carbon_overage_kg"], 0)
        self.assertEqual(tight_point["demand_met_pct"], 100)
        self.assertIn("compliance_fallback", tight_point)
        self.assertLess(tight_point["compliance_fallback"]["demand_met_pct"], 100)

    def test_invalid_dataset_id_returns_clear_error(self):
        response = client.post(
            "/api/optimizer/solve",
            json={
                "dataset_id": "missing",
                "scenario": {
                    "carbon_cap_kg": 500_000_000,
                    "max_overtime_pct": 0,
                    "facility_capacity_multipliers": {},
                    "demand_multiplier": 1,
                    "carbon_penalty_usd_per_kg": None,
                    "unmet_demand_penalty_usd_per_unit": None,
                },
            },
        )

        self.assertEqual(response.status_code, 404)
        self.assertIn("Only 'demo' is available", response.json()["detail"])

    def _solve(self, carbon_cap_kg=500_000_000, demand_multiplier=1):
        response = client.post(
            "/api/optimizer/solve",
            json={
                "dataset_id": "demo",
                "scenario": {
                    "carbon_cap_kg": carbon_cap_kg,
                    "max_overtime_pct": 10,
                    "facility_capacity_multipliers": {},
                    "demand_multiplier": demand_multiplier,
                    "carbon_penalty_usd_per_kg": None,
                    "unmet_demand_penalty_usd_per_unit": None,
                },
            },
        )
        self.assertEqual(response.status_code, 200)
        return response.json()


if __name__ == "__main__":
    unittest.main()
