from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_check_setup_status_invoke() -> None:
    response = client.post("/api/v1/bridge/invoke/check_setup_status", json={"args": {}})
    assert response.status_code == 200
    payload = response.json()
    assert payload["command"] == "check_setup_status"
    assert payload["result"]["needs_setup"] is False


def test_db_save_setting_and_get_setting() -> None:
    save_response = client.post(
        "/api/v1/bridge/invoke/db_save_setting",
        json={"args": {"key": "theme", "value": "dark", "category": "ui"}},
    )
    assert save_response.status_code == 200

    get_response = client.post(
        "/api/v1/bridge/invoke/db_get_setting",
        json={"args": {"key": "theme"}},
    )
    assert get_response.status_code == 200
    assert get_response.json()["result"] == "dark"
