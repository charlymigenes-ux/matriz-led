"""Fixtures para los tests de este plugin.

Este plugin corre EN PROCESO con NOPAL (no está sandboxeado -- ver el
docstring de backend/router.py) y su router usa `backend.auth_deps` de
NOPAL core en tiempo de ejecución. Para correr estos tests hace falta un
checkout de NOPAL core accesible:

- Por convención, este repo se clona dentro de plugins/matriz-led/ de ese
  checkout (ver plugin_installer_service.py de NOPAL core), en cuyo caso
  NOPAL core está 2 niveles arriba de esta carpeta de tests/.
- Si se corre desde otro lado, seteá la variable de entorno
  NOPAL_CORE_ROOT apuntando a uno.

Carga backend/router.py de este mismo plugin con la misma técnica que usa
backend/services/plugin_loader_service.py de NOPAL core (duplicada acá,
self-contained), así los tests ejercitan el router exactamente como se
carga en producción. Mismo patrón que
plugins/arduino-accessories/tests/conftest.py.
"""

import importlib.util
import os
import sys
import types
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.sessions import SessionMiddleware

PLUGIN_ROOT = Path(__file__).resolve().parents[1]
NOPAL_CORE_ROOT = Path(os.environ.get("NOPAL_CORE_ROOT") or PLUGIN_ROOT.parents[1])
core_path = str(NOPAL_CORE_ROOT)
if core_path in sys.path:
    sys.path.remove(core_path)
sys.path.insert(0, core_path)

try:
    from backend.auth_deps import require_auth
except ImportError as e:
    raise RuntimeError(
        "No se pudo importar backend.auth_deps de NOPAL core. Este plugin no es "
        "standalone (corre en proceso con NOPAL) -- corré estos tests desde un "
        "checkout de NOPAL con este repo en plugins/matriz-led/, o seteá "
        "NOPAL_CORE_ROOT apuntando a uno."
    ) from e

ADMIN_USER = {"id": "test-admin", "username": "test-admin", "role": "admin"}
OPERATOR_USER = {"id": "test-operator", "username": "test-operator", "role": "operator"}

_NAMESPACE = "nopal_plugin_test_matriz_led"


def _load_router():
    if _NAMESPACE not in sys.modules:
        ns_module = types.ModuleType(_NAMESPACE)
        ns_module.__path__ = []
        sys.modules[_NAMESPACE] = ns_module

    backend_dir = PLUGIN_ROOT / "backend"
    pkg_name = f"{_NAMESPACE}.pkg"
    pkg_spec = importlib.util.spec_from_file_location(
        pkg_name, backend_dir / "__init__.py", submodule_search_locations=[str(backend_dir)],
    )
    pkg_module = importlib.util.module_from_spec(pkg_spec)
    sys.modules[pkg_name] = pkg_module
    pkg_spec.loader.exec_module(pkg_module)

    module_name = f"{pkg_name}.router"
    module_spec = importlib.util.spec_from_file_location(module_name, backend_dir / "router.py")
    module = importlib.util.module_from_spec(module_spec)
    module.__package__ = pkg_name
    sys.modules[module_name] = module
    module_spec.loader.exec_module(module)
    return module


_ROUTER_MODULE = _load_router()
screen_service = sys.modules[f"{_NAMESPACE}.pkg.services.screen_service"]


@pytest.fixture(scope="session")
def app():
    fastapi_app = FastAPI()
    fastapi_app.include_router(_ROUTER_MODULE.router)
    fastapi_app.add_middleware(SessionMiddleware, secret_key="test-secret")
    return fastapi_app


@pytest.fixture(scope="session")
def client(app):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def as_admin(app):
    app.dependency_overrides[require_auth] = lambda: ADMIN_USER
    yield ADMIN_USER
    app.dependency_overrides.pop(require_auth, None)


@pytest.fixture
def as_operator(app):
    app.dependency_overrides[require_auth] = lambda: OPERATOR_USER
    yield OPERATOR_USER
    app.dependency_overrides.pop(require_auth, None)


@pytest.fixture(autouse=True)
def isolated_config(tmp_path, monkeypatch):
    """Aísla CONFIG_PATH/ANNOUNCEMENTS_PATH a un directorio temporal por
    test -- sin esto los tests pisarían el data/plugins/matriz-led/ real.
    También resetea el flag de "ya saludó" (_last_known_connected) -- sin
    esto, un test anterior que dejó la pantalla "conectada" haría que el
    siguiente test no detecte la transición y no dispare el saludo."""
    monkeypatch.setattr(screen_service, "CONFIG_PATH", tmp_path / "config.json")
    monkeypatch.setattr(screen_service, "ANNOUNCEMENTS_PATH", tmp_path / "announcements.json")
    monkeypatch.setattr(screen_service, "LAST_SENT_PATH", tmp_path / "last_sent.json")
    monkeypatch.setattr(screen_service, "STATS_PATH", tmp_path / "stats.json")
    monkeypatch.setattr(screen_service, "RULES_PATH", tmp_path / "rules.json")
    monkeypatch.setattr(screen_service, "MACHINE_ALERTS_PATH", tmp_path / "machine_alerts.json")
    monkeypatch.setattr(screen_service, "_last_known_connected", False)
