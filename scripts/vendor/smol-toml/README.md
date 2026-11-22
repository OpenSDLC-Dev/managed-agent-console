# smol-toml

The Console harness doctor reads Codex project configuration before project packages are installed. The seven JavaScript files in this directory are based on the ESM parser modules in `package/dist/` in the npm release. Copyright Squirrel Chat et al. [BSD-3-Clause license](./LICENSE)

The pinned release is `smol-toml@1.9.1`. Git tag `v1.9.1` resolves to `69aa050fef018b71799519bb2cbb54f158a0c5f9`. [Upstream source](https://github.com/squirrelchat/smol-toml/tree/69aa050fef018b71799519bb2cbb54f158a0c5f9) · [Published archive](https://registry.npmjs.org/smol-toml/-/smol-toml-1.9.1.tgz)

Local changes align three cases with the Codex TOML parser. `date.js` rejects calendar-day rollover, `extract.js` checks the numeric UTC offset, and `parse.js` promotes an implicit array parent when its own table header appears. The harness doctor suite covers accepted and rejected examples for all three.

When updating, verify the archive against its npm SHA-512 integrity, copy the license and the modules imported by `parse.js`, reconcile the three local changes, then run the harness doctor tests from a clean clone. The integrity for this release is `sha512-j7WyPdf0CJoutMzMoPLF/bVXHtKZIT9Rb4eGeEbWw8X2t5oirjPgpL+OpaENZrILYaXqYwnVH+qgUwVbl+pUJQ==`.
