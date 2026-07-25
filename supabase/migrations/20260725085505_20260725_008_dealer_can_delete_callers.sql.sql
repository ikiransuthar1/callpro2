/*
# Allow dealers to delete their own caller profiles

1. Security
- Adds a DELETE policy on `profiles` so a dealer can remove caller accounts
  that belong to their own dealership (role = 'caller' AND same dealer_id).
- The existing `profiles_delete_founder` policy (founder can delete any
  profile) is left intact, so both founder and dealer can remove callers.
2. Important notes
- A dealer can ONLY delete profiles whose role is 'caller' — never other
  dealers or the founder account.
- The ownership check uses the existing `get_my_dealer_id()` SECURITY
  DEFINER helper, which returns the dealer_id of the authenticated user.
- Lead reassignment (setting assigned_caller_id / locked_by back to NULL)
  is handled by the frontend before the profile row is deleted.
*/

DROP POLICY IF EXISTS "profiles_delete_dealer" ON profiles;
CREATE POLICY "profiles_delete_dealer"
ON profiles FOR DELETE
TO authenticated
USING (
  role = 'caller'
  AND dealer_id IS NOT NULL
  AND dealer_id = get_my_dealer_id()
  AND get_my_role() = 'dealer'
);
