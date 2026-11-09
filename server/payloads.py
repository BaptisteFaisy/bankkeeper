"""HTTP payload validation for the Tidewater relay. Stdlib only, pure.

Every validator returns (clean, None) or (None, error_code) and never
raises. Split out of relay.py so the relay file stays under 500 lines.
"""

from __future__ import annotations


def _as_nonempty_str(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _as_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


def _as_nonneg_int(value: object) -> int | None:
    n = _as_int(value)
    return n if n is not None and n >= 0 else None


def _as_number(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _as_action(value: object, allowed: set[str]) -> str | None:
    text = _as_nonempty_str(value)
    if text is None:
        return None
    return text.lower() if text.lower() in allowed else None


def _as_dict(body: object) -> dict | None:
    return body if isinstance(body, dict) else None


def validate_auth_payload(body: object) -> tuple[dict | None, str | None]:
    """Return (clean, None) or (None, error_code). Pure."""
    data = _as_dict(body)
    if data is None:
        return None, "E_BAD_JSON"
    email = _as_nonempty_str(data.get("email"))
    pseudo = _as_nonempty_str(data.get("pseudo"))
    if email is None or "@" not in email or pseudo is None:
        return None, "E_BAD_AUTH"
    return {"email": email, "pseudo": pseudo}, None


MESH_NAMES = {"large": "large", "large mesh": "large",
              "small": "small", "small mesh": "small"}


def validate_assign_payload(body: object) -> tuple[dict | None, str | None]:
    data = _as_dict(body)
    if data is None:
        return None, "E_BAD_JSON"
    boat = _as_nonempty_str(data.get("boat"))
    zone = _as_nonempty_str(data.get("zone"))
    quay = data.get("quay") is True or (zone is not None
                                        and zone.lower() == "quay")
    if boat is None or (zone is None and not quay):
        return None, "E_BAD_ASSIGN"
    mesh = None
    if data.get("mesh") is not None:
        raw = _as_nonempty_str(data.get("mesh"))
        mesh = MESH_NAMES.get(raw.lower()) if raw else None
        if mesh is None:
            return None, "E_BAD_ASSIGN"
    return {"boat": boat, "zone": zone, "quay": quay, "mesh": mesh}, None


def validate_survey_payload(body: object) -> tuple[dict | None, str | None]:
    data = _as_dict(body)
    if data is None:
        return None, "E_BAD_JSON"
    zone = _as_nonempty_str(data.get("zone"))
    if zone is None:
        return None, "E_BAD_SURVEY"
    return {"zone": zone}, None


def _validate_action_ref(body: object, allowed: set[str],
                         code: str) -> tuple[dict | None, str | None]:
    data = _as_dict(body)
    if data is None:
        return None, "E_BAD_JSON"
    action = _as_action(data.get("action"), allowed)
    ref = _as_nonempty_str(data.get("ref"))
    if action is None or ref is None:
        return None, code
    return {"action": action, "ref": ref}, None


def validate_licence_payload(body: object) -> tuple[dict | None, str | None]:
    return _validate_action_ref(body, {"buy", "sell"}, "E_BAD_LICENCE")


def validate_debt_payload(body: object) -> tuple[dict | None, str | None]:
    return _validate_action_ref(body, {"buy", "forbear", "seize"}, "E_BAD_DEBT")


def validate_council_payload(body: object) -> tuple[dict | None, str | None]:
    data = _as_dict(body)
    if data is None:
        return None, "E_BAD_JSON"
    action = _as_action(data.get("action"), {"propose", "vote"})
    rule = _as_nonempty_str(data.get("rule"))
    if action is None or rule is None:
        return None, "E_BAD_COUNCIL"
    clean: dict = {"action": action, "rule": rule}
    if data.get("indemnity") is not None:
        amount = _as_number(data.get("indemnity"))
        if amount is None or amount < 0:
            return None, "E_BAD_COUNCIL"
        clean["indemnity"] = amount
    return clean, None


def validate_fastforward_payload(body: object) -> tuple[dict | None,
                                                       str | None]:
    data = _as_dict(body)
    if data is None:
        return None, "E_BAD_JSON"
    if _as_int(data.get("days")) not in (7, 28):
        return None, "E_BAD_FASTFORWARD"
    seed = _as_nonneg_int(data.get("seed", 7))
    if seed is None:
        return None, "E_BAD_FASTFORWARD"
    return {"days": _as_int(data.get("days")), "seed": seed}, None


def validate_day_payload(body: object) -> tuple[dict | None, str | None]:
    """Ending the day takes no arguments; an empty object is enough."""
    data = _as_dict(body)
    if data is None:
        return None, "E_BAD_JSON"
    return {}, None
