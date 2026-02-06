from gemini_discovery import build_event_hash_id, normalize_gemini_response, to_upsert_event_dict


def _base_event(**overrides):
    event = {
        "title": "Kinderzirkus Altona",
        "description": "Familienfreundliche Vorstellung",
        "date_start": "2026-02-14T11:00:00Z",
        "date_end": None,
        "location_name": "Festplatz Altona",
        "location_address": "Beispielstrasse 1, 22765 Hamburg",
        "location_district": "Altona",
        "location_lat": None,
        "location_lng": None,
        "category": "theater",
        "is_indoor": True,
        "age_suitability": "4+",
        "price_info": "ab 8 EUR",
        "original_link": "https://example.org/event/1",
        "region": "hamburg",
    }
    event.update(overrides)
    return event


def test_normalize_converts_z_to_berlin_timezone():
    data = {"events": [_base_event(date_start="2026-02-14T11:00:00Z")]}
    normalized, issues = normalize_gemini_response(data, default_region="hamburg", limit=30)

    assert issues == []
    assert len(normalized) == 1
    assert normalized[0]["date_start"] == "2026-02-14T12:00:00+01:00"


def test_normalize_interprets_naive_datetime_as_berlin_local():
    data = {"events": [_base_event(date_start="2026-07-14T11:00:00", region="hamburg")]}
    normalized, _ = normalize_gemini_response(data, default_region="hamburg", limit=30)

    assert len(normalized) == 1
    assert normalized[0]["date_start"] == "2026-07-14T11:00:00+02:00"


def test_normalize_invalid_category_falls_back_to_outdoor():
    data = {"events": [_base_event(category="dance-party")]}
    normalized, issues = normalize_gemini_response(data, default_region="hamburg", limit=30)

    assert issues == []
    assert len(normalized) == 1
    assert normalized[0]["category"] == "outdoor"


def test_normalize_missing_required_field_drops_event():
    data = {"events": [_base_event(title=""), _base_event()]}
    normalized, issues = normalize_gemini_response(data, default_region="hamburg", limit=30)

    assert len(normalized) == 1
    assert any("missing title" in issue for issue in issues)


def test_normalize_invalid_url_to_none_and_default_region():
    data = {"events": [_base_event(original_link="foo", region="")]}
    normalized, _ = normalize_gemini_response(data, default_region="hamburg", limit=30)

    assert len(normalized) == 1
    assert normalized[0]["original_link"] is None
    assert normalized[0]["region"] == "hamburg"


def test_build_event_hash_id_is_deterministic():
    event_a = _base_event(title="Kinderzirkus, Altona!")
    event_b = _base_event(title="Kinderzirkus Altona", location_name=" Festplatz  Altona ")

    assert build_event_hash_id(event_a) == build_event_hash_id(event_b)


def test_to_upsert_event_dict_sets_source_id_and_id():
    event = _base_event()
    upsert = to_upsert_event_dict(event, source_id="source-123")

    assert upsert["source_id"] == "source-123"
    assert isinstance(upsert["id"], str)
    assert len(upsert["id"]) == 32
