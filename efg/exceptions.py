# We don't have classes in Effigy yet so these classes need to be
# declared directly in Python and imported by `peg.efg' for now.

class MatchError(Exception): pass
class PredicateError(MatchError): pass
