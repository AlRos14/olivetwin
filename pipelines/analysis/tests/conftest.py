import shutil
import sys
import uuid
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

# Directorio de trabajo de los tests dentro del propio pipeline (staging/ no se versiona);
# no se usa el directorio temporal del sistema.
WORK = ROOT / "staging" / "tests"


@pytest.fixture
def work_dir():
    d = WORK / uuid.uuid4().hex[:8]
    d.mkdir(parents=True, exist_ok=True)
    yield d
    shutil.rmtree(d, ignore_errors=True)
