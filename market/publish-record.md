# Publish record · 2026-10-24

Official npm version records and canonical tarball HEAD/GET were rechecked after the initial processing window. All five new tarballs return 200. The Release assets were downloaded again and match the exact files submitted to npm.

The first verification window returned 404 while npm processed the uploads; no version was republished or bumped to work around that delay.

| Package | Version | Tarball | KB | SHA-1 = npm dist.shasum | SHA-256 | npm integrity |
|---|---|---|---|---|---|---|
| `@hwfee/dsh-genui` | 0.1.2 | `hwfee-dsh-genui-0.1.2.tgz` | 96.0 | `9fbcb34fa2a49d3c19d176cfbdcd51b22b4bb064` | `7cff1796ddfa2f3a696ffe8dcb3fd0229a172b056685c10d3b68bb889fb6ba74` | `sha512-nE5sB+hOJsVz8p8odcmAN88JxwKMWHCqt1D1dAt4AteOgYD8JgXvl7C20GHqK13OYU/S0HIo5nEk+qUsKXCHMg==` |
| `@hwfee/dsh-git-bash` | 0.1.2 | `hwfee-dsh-git-bash-0.1.2.tgz` | 48.3 | `297ab133f70f35bc89c0cdd49eced741223889e6` | `85a498fe70fbf1a8e2b6ed883c9d9c501725088f20752f37298a4aaeb9dbd240` | `sha512-Cur7Xl5NSbOWQLehj2PJSlDgzVgjV7GXCgcdSJpeVjmbMJTt70BQnoV7TspbyOIcGb/R47wg17mWENDA3cJeWQ==` |
| `@hwfee/dsh-predict` | 0.1.2 | `hwfee-dsh-predict-0.1.2.tgz` | 28.2 | `2507c8c11afc2078ef1006cf953a21faac6cb520` | `8e42ba858911f43b61e2a76b8f685fe84d55f2f9fc3396cc8611ee23e9e77119` | `sha512-cxwKLRI4nuDBPcQqh1xoLCc40OEu2//KRfRsqeP7iZrs4SZwGVKiXbkTdvrtkJn9JT5vy5F/m8bdZI+35AtCoA==` |
| `@hwfee/dsh-usage-stats` | 0.1.4 | `hwfee-dsh-usage-stats-0.1.4.tgz` | 44.9 | `608009917c352add6bb68333d823a8fa366c1778` | `86a6fb128a2d43204276ae0d762dc4236bee29d84dc31e87767bc439b3608a51` | `sha512-rOKq9d39zHxy7ppjIe/iz5HLaoBpZZnJvb1J24DBpVbAcXr9GbX1oUxiQu/HN0+hBubzZACBgutHRZtXcwiEtg==` |
| `dsh-cds-theme` | 0.1.8 | `dsh-cds-theme-0.1.8.tgz` | 3168.1 | `ea6ffeb131732f0be3d524d875eeebae3dd6a8d1` | `c618f4f1d4f7862744bce3f9413ff88196224ed1db35c6f243f4ab9a4ea69e73` | `sha512-6+/GDSBxbv7v+pSa0jJKkH3f4G/PBWxQNZ/AAlSwwo8fK0NBoxTQlZDFkE83RsmHvAIFOcpQOsEoUqWPrWgahA==` |

dsh-system-fonts remains at 0.1.3 and was not republished. The previous record is archived in [publish-record-2026-10-22.md](publish-record-2026-10-22.md).
