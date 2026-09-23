"""Buying test guards: no real B-Stock traffic from a test that stores a login."""

from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def _no_signed_in_search():
    """
    Costco is a signed-in-only seller (``Marketplace.requires_login``): with a stored login, a
    pull's first run would search it on B-Stock for real. Tests see no login for that search
    unless they patch ``scraper.login_for_signed_in_sellers`` themselves.
    """
    with patch('apps.buying.services.scraper.login_for_signed_in_sellers', return_value=''):
        yield
