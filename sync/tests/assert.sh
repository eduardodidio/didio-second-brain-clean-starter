# sync/tests/assert.sh — source at top of every test file
die() { echo "FAIL: $*" >&2; exit 1; }
assert_eq() { [ "$1" = "$2" ] || die "expected '$1' == '$2' ($3)"; }
assert_file_contains() { grep -q -- "$2" "$1" || die "'$1' missing '$2'"; }
assert_file_absent() { [ ! -e "$1" ] || die "expected '$1' to not exist"; }
assert_exit_code() { local exp=$1; shift; "$@"; local actual=$?; [ "$actual" = "$exp" ] || die "expected exit $exp, got $actual ($*)"; }
