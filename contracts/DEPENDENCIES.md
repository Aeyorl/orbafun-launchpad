# Vendored Solidity dependencies

The Solidity dependencies are committed as ordinary repository files under
`contracts/lib/`; they are not Git submodules and the build requires no
dependency checkout step.

| Dependency | Upstream | Verified upstream commit |
|---|---|---|
| forge-std | <https://github.com/foundry-rs/forge-std> | `bf647bd6046f2f7da30d0c2bf435e5c76a780c1b` |
| Solady | <https://github.com/Vectorized/solady> | `acd959aa4bd04720d640bf4e6a5c71037510cc4b` |

On 2026-08-25, every file under each vendored `src/` tree was compared with the
corresponding upstream commit after normalizing checkout line endings; there
were zero missing, extra or different source files. The exact vendored bytes
used by the candidate are independently pinned in `audit/ARTIFACTS.sha256`.

The previous nested `.gitmodules` and `foundry.lock` files were removed because
the directories were already vendored as regular files. Keeping submodule lock
metadata for non-submodule paths caused Foundry to compare the parent Orba commit
to unrelated upstream commit IDs and emit false revision-mismatch warnings.
