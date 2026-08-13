#!/usr/bin/env bash
# Build OpenMKM and its Cantera 2.5 fork from source on a modern Linux
# toolchain (tested: Ubuntu 24.04, gcc 13, Python 3.11). Produces the `omkm`
# binary that tools/openmkm/run_sweep.py drives.
#
# Usage:  tools/openmkm/build.sh [work_dir]   (default: ~/openmkm-build)
#
# The two patches under patches/ carry the compatibility fixes this needs:
#   cantera-fork-python311.patch  removes the Python-3.11-incompatible "rU"
#                                 open() mode from the fork's build scripts
#   openmkm-boost183.patch        moves barycentric_rational to its
#                                 boost::math::interpolators home (Boost >= 1.83)
# Two more fixes ride as flags below: -fcommon (gcc >= 10 stopped merging the
# old bundled SUNDIALS' duplicate common symbols) and EIGEN_SKIP_LIBRARY
# (OpenMKM's CMake insists on finding "libraries" for header-only Eigen).
set -euo pipefail

WORK="${1:-$HOME/openmkm-build}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CANTERA_PREFIX="$WORK/cantera-install"
JOBS="$(nproc)"

mkdir -p "$WORK"

# --- toolchain + headers -----------------------------------------------------
sudo() { [ "$(id -u)" = 0 ] && "$@" || command sudo "$@"; }
sudo apt-get update -qq || true
sudo apt-get install -y build-essential cmake git libboost-dev \
  libboost-filesystem-dev libboost-system-dev libeigen3-dev python3-pip
pip install --quiet scons

# --- Cantera 2.5 fork (openmkm branch) ---------------------------------------
if [ ! -d "$WORK/cantera" ]; then
  git clone --depth 1 --branch openmkm https://github.com/mbkumar/cantera "$WORK/cantera"
  git -C "$WORK/cantera" submodule update --init --recursive
  git -C "$WORK/cantera" apply "$HERE/patches/cantera-fork-python311.patch"
fi
cd "$WORK/cantera"
scons build -j"$JOBS" optimize=False python_package=n f90_interface=n \
  doxygen_docs=n system_eigen=y system_sundials=n \
  extra_inc_dirs=/usr/include/eigen3 cc_flags="-fcommon" \
  prefix="$CANTERA_PREFIX"
scons install

# --- OpenMKM ------------------------------------------------------------------
if [ ! -d "$WORK/openmkm" ]; then
  git clone --depth 1 https://github.com/vlachosgroup/openmkm "$WORK/openmkm"
  git -C "$WORK/openmkm" apply "$HERE/patches/openmkm-boost183.patch"
fi
cd "$WORK/openmkm/src"
cmake -S . -B build \
  -DCANTERA_PREFIX="$CANTERA_PREFIX" \
  -DEIGEN_PREFIX=/usr/include/eigen3 \
  -DEIGEN_SKIP_LIBRARY:BOOL=TRUE
cmake --build build -j"$JOBS"

echo
echo "omkm binary: $WORK/openmkm/src/build/omkm"
echo "run it with: LD_LIBRARY_PATH=$CANTERA_PREFIX/lib $WORK/openmkm/src/build/omkm"
