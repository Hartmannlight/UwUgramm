"""Exercise Authlib's real signature/claim validation with a local test signing key."""

import time
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlparse

import pytest
from authlib.integrations.base_client.errors import OAuthError
from joserfc import jwt
from joserfc.errors import JoseError
from joserfc.jwk import RSAKey

from app.api.auth import oauth


@pytest.fixture
def provider(monkeypatch):
    client = oauth.google
    key = RSAKey.generate_key(2048, parameters={"kid": "test-key"})
    metadata = {
        "issuer": "https://accounts.google.com",
        "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
        "id_token_signing_alg_values_supported": ["RS256"],
        "jwks": {"keys": [key.as_dict(private=False)]},
    }
    monkeypatch.setattr(client, "client_id", "test-client")
    monkeypatch.setattr(client, "load_server_metadata", AsyncMock(return_value=metadata))
    return client, key


async def test_login_uses_pkce_state_nonce_and_minimum_scope(provider):
    client, _ = provider
    result = await client.create_authorization_url("https://diagram.example/api/auth/callback")
    params = parse_qs(urlparse(result["url"]).query)
    assert params["scope"] == ["openid"]
    assert params["code_challenge_method"] == ["S256"]
    assert params["state"][0] == result["state"]
    assert params["nonce"][0] == result["nonce"]
    assert len(result["code_verifier"]) >= 43


@pytest.mark.parametrize(
    "claim,value", [("iss", "https://evil.example"), ("aud", "someone-else"), ("nonce", "wrong"), ("exp", 1)]
)
async def test_bad_claims_fail(provider, claim, value):
    client, key = provider
    claims = {
        "iss": "https://accounts.google.com",
        "aud": "test-client",
        "sub": "subject",
        "iat": int(time.time()),
        "exp": int(time.time()) + 300,
        "nonce": "nonce",
    }
    claims[claim] = value
    encoded = jwt.encode({"alg": "RS256", "kid": "test-key"}, claims, key)
    with pytest.raises((JoseError, OAuthError)):
        await client.parse_id_token({"id_token": encoded, "access_token": "unused"}, nonce="nonce", leeway=0)


async def test_valid_token_and_bad_signature(provider):
    client, key = provider
    claims = {
        "iss": "https://accounts.google.com",
        "aud": "test-client",
        "sub": "subject",
        "iat": int(time.time()),
        "exp": int(time.time()) + 300,
        "nonce": "nonce",
    }
    encoded = jwt.encode({"alg": "RS256", "kid": "test-key"}, claims, key)
    verified = await client.parse_id_token(
        {"id_token": encoded, "access_token": "unused"}, nonce="nonce", leeway=0
    )
    assert verified["sub"] == "subject"
    wrong_key = RSAKey.generate_key(2048, parameters={"kid": "test-key"})
    bad = jwt.encode({"alg": "RS256", "kid": "test-key"}, claims, wrong_key)
    with pytest.raises(JoseError):
        await client.parse_id_token({"id_token": bad, "access_token": "unused"}, nonce="nonce", leeway=0)
