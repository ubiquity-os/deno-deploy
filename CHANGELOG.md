# Changelog

## [1.7.0](https://github.com/ubiquity-os/deno-deploy/compare/v1.6.1...v1.7.0) (2026-04-09)


### Features

* add Deno settings summary link ([4a28c2d](https://github.com/ubiquity-os/deno-deploy/commit/4a28c2da85576d7881cd925577b0f83933c83ea3))
* **ci:** move manifest updates to artifact branches ([2616da8](https://github.com/ubiquity-os/deno-deploy/commit/2616da80185ef6ac5cae1208836790032facc39d))
* migrate action to Deno Deploy apps ([0a93673](https://github.com/ubiquity-os/deno-deploy/commit/0a93673d7bdad1f835ed6f4540fd632262ef8bd9))
* refactor deploy action for Deno API v2 ([15f579d](https://github.com/ubiquity-os/deno-deploy/commit/15f579d8df68a94e6fe114348474b611d9c7a157))
* support GitHub-linked Deno builds ([ba8b468](https://github.com/ubiquity-os/deno-deploy/commit/ba8b46849e862c343e0bc077d86e07942329e4b2))


### Bug Fixes

* address remaining provision review comments ([a2c1dcf](https://github.com/ubiquity-os/deno-deploy/commit/a2c1dcf67bdb88bda421c70539d4927952513216))
* allow provision without org for existing apps ([c149fc7](https://github.com/ubiquity-os/deno-deploy/commit/c149fc7b5ce18c3df9fefebe292474f6c67ec58d))
* allow sys access for org inference ([52ace56](https://github.com/ubiquity-os/deno-deploy/commit/52ace565309b28ffffd6421e3687447c873d5c10))
* allow wsl probe file reads ([0eccdcd](https://github.com/ubiquity-os/deno-deploy/commit/0eccdcd5f623eccd7674b9346b73516bb63a4323))
* always deploy on first provision ([c3a27e6](https://github.com/ubiquity-os/deno-deploy/commit/c3a27e6fd1fe9a0826c0158342a582598a7da20b))
* avoid broken deploy token flag ([cd6e8f5](https://github.com/ubiquity-os/deno-deploy/commit/cd6e8f5152e0dd7c76539bfacf85440fcbc99548))
* bootstrap first Deno deployment ([fc402b9](https://github.com/ubiquity-os/deno-deploy/commit/fc402b965657fbfa800a38a6c7b5d3e3c2c5ae37))
* bootstrap plain Deno apps ([1b6ff95](https://github.com/ubiquity-os/deno-deploy/commit/1b6ff953c0bdb924043577d1a90e908d332831ef))
* cap generated Deno app slugs ([c23db39](https://github.com/ubiquity-os/deno-deploy/commit/c23db39f7f64f085bb35e228cf3920e48107d428))
* create branch apps via api ([8f5bda4](https://github.com/ubiquity-os/deno-deploy/commit/8f5bda459fdb4a8689039017a7ebd91e55405604))
* derive manifest ref in deno builds ([111c985](https://github.com/ubiquity-os/deno-deploy/commit/111c985fc8fe2cb26a104568501eaf465b81b41e))
* do not fail delete when artifact branch is already absent ([59c61b5](https://github.com/ubiquity-os/deno-deploy/commit/59c61b53d7128d2dc8b436da3e1e2beebfd9a87a))
* enable kv in deno deploy builds ([59c1655](https://github.com/ubiquity-os/deno-deploy/commit/59c1655412afb9c81c36c86ada402aa371bf1b18))
* exclude reserved Deno env vars ([41d5fe7](https://github.com/ubiquity-os/deno-deploy/commit/41d5fe7f017c1b48ea0756f144fe74739125c222))
* fall back to legacy deno app slug env ([a0a760c](https://github.com/ubiquity-os/deno-deploy/commit/a0a760c1667ce043ffc7419abe5f0b9a67ae73bd))
* harden publish and action helpers ([f8726c2](https://github.com/ubiquity-os/deno-deploy/commit/f8726c29cffa7cc82660d9fce9af1db4ad59c6f0))
* infer Deno organization from token ([10b5b88](https://github.com/ubiquity-os/deno-deploy/commit/10b5b88deae99470a175d4c5211ee4d9130d9d00))
* infer deno orgs directly from token ([072a4bb](https://github.com/ubiquity-os/deno-deploy/commit/072a4bb76d638d5347ce81f5c5bfef6054b80fee))
* match deploy create CLI pattern ([897d007](https://github.com/ubiquity-os/deno-deploy/commit/897d0077301337d455189cc75e55b2652f2f3feb))
* normalize absolute deno entrypoints ([5069cb0](https://github.com/ubiquity-os/deno-deploy/commit/5069cb072e55918e974405ed8a036bd998a0beda))
* pass blank app directory ([2c39eca](https://github.com/ubiquity-os/deno-deploy/commit/2c39ecaf3d11725accd1b28b47e1a17268922aef))
* preserve kv support in generated config ([1e722fb](https://github.com/ubiquity-os/deno-deploy/commit/1e722fb0759c8992ed7de068e4d1765c27d1fc35))
* resolve sanitized routed manifest branches ([e6c35f1](https://github.com/ubiquity-os/deno-deploy/commit/e6c35f1a28b865336cad1c123c7d5d8bbcd60bea))
* restore deno deploy org inference ([1db64b2](https://github.com/ubiquity-os/deno-deploy/commit/1db64b2e7098dccac1fc3e9d3c0b985a7a740db4))
* set deno org as output ([930601f](https://github.com/ubiquity-os/deno-deploy/commit/930601fbf2e63b19185e297aa41dafb30cdc5f3f))
* skip dist and tag refs in deploy action ([#26](https://github.com/ubiquity-os/deno-deploy/issues/26)) ([e72e184](https://github.com/ubiquity-os/deno-deploy/commit/e72e184943435473f7920fc204c1f2939af48b50))
* stage kv-enabled deno config for deploy ([1fb85a7](https://github.com/ubiquity-os/deno-deploy/commit/1fb85a7f17f6483bbd4c32c4af737da1cf8928b2))
* sync REF_NAME to Deno env ([bbbcbc6](https://github.com/ubiquity-os/deno-deploy/commit/bbbcbc668da89b6aaa5dfcbedf246f0b14e8ef23))
* tolerate missing artifact branch during delete ([667afa4](https://github.com/ubiquity-os/deno-deploy/commit/667afa4abaa42b3d013605fe01bf26fc6e13a150))
* update deno build manifest commands ([800fae5](https://github.com/ubiquity-os/deno-deploy/commit/800fae5777f055f9694f286530cd7c7c5f1d39ef))
* use preview env context ([4cc1d1f](https://github.com/ubiquity-os/deno-deploy/commit/4cc1d1f035240d8ef5b7d6df11fdcf8fceb23335))
* use repo root app directory ([1703c95](https://github.com/ubiquity-os/deno-deploy/commit/1703c9530f80953289283760e4d37fc4e2086b36))

## [1.6.1](https://github.com/ubiquity-os/deno-deploy/compare/v1.6.0...v1.6.1) (2026-03-05)


### Bug Fixes

* **action:** default sourceRef for delete events ([87166b5](https://github.com/ubiquity-os/deno-deploy/commit/87166b5f07bd618de5c75862cbbfba3f339b5b34))
* **action:** default sourceRef for delete events ([744385b](https://github.com/ubiquity-os/deno-deploy/commit/744385be651a4f9f8526537e0ac7bb3b7b90e4b0))

## [1.6.0](https://github.com/ubiquity-os/deno-deploy/compare/v1.5.0...v1.6.0) (2026-03-05)


### Features

* migrate deno deploy manifest updates to artifact branches ([95d742a](https://github.com/ubiquity-os/deno-deploy/commit/95d742a6f9fdfbb007bf163f61ece5f435f448bb))
* move deno-deploy manifest updates to artifact branches ([2b5a895](https://github.com/ubiquity-os/deno-deploy/commit/2b5a895115b4b06e4d17ce5fe04b77a333289cff))

## [1.5.0](https://github.com/ubiquity-os/deno-deploy/compare/v1.4.0...v1.5.0) (2025-11-02)


### Features

* deno deploy ([a87ced2](https://github.com/ubiquity-os/deno-deploy/commit/a87ced2c6c103614e1ed9a586c04faa1cf445493))


### Bug Fixes

* add Prettier formatting step ([7124558](https://github.com/ubiquity-os/deno-deploy/commit/712455814057fe8bc9072fde7c4dac3639cbd9cd))
* construct deployment URL directly for Deno Deploy ([6ab45ec](https://github.com/ubiquity-os/deno-deploy/commit/6ab45ecf890235fb826da3a042e9183bfd752b4d))
* removed `USER_` from ignored environment variables ([396c507](https://github.com/ubiquity-os/deno-deploy/commit/396c50797023d5106e50c9bd129b0d85aa785c2f))
* removed Deno code generation and added extra options for deployment ([c67d935](https://github.com/ubiquity-os/deno-deploy/commit/c67d93590593bbcfc498937b1be60d06a313bb52))
* replace `bunx` with `npx` for Prettier execution ([143a823](https://github.com/ubiquity-os/deno-deploy/commit/143a8232424f7c94ef7795d235eb0640266e25cd))
* sanitize project and branch names for Deno Deploy compliance ([af2d8b0](https://github.com/ubiquity-os/deno-deploy/commit/af2d8b04fba214990ce4dacb5d75358b29a97c94))
* separate workflows ([3a61577](https://github.com/ubiquity-os/deno-deploy/commit/3a615777930bd73c070eb0692fe0f5b8a507736a))

## [1.4.0](https://github.com/ubiquity-os/deno-deploy/compare/v1.3.0...v1.4.0) (2025-06-27)


### Features

* deno deploy ([a87ced2](https://github.com/ubiquity-os/deno-deploy/commit/a87ced2c6c103614e1ed9a586c04faa1cf445493))


### Bug Fixes

* construct deployment URL directly for Deno Deploy ([6ab45ec](https://github.com/ubiquity-os/deno-deploy/commit/6ab45ecf890235fb826da3a042e9183bfd752b4d))
* removed `USER_` from ignored environment variables ([396c507](https://github.com/ubiquity-os/deno-deploy/commit/396c50797023d5106e50c9bd129b0d85aa785c2f))
* removed Deno code generation and added extra options for deployment ([c67d935](https://github.com/ubiquity-os/deno-deploy/commit/c67d93590593bbcfc498937b1be60d06a313bb52))
* sanitize project and branch names for Deno Deploy compliance ([af2d8b0](https://github.com/ubiquity-os/deno-deploy/commit/af2d8b04fba214990ce4dacb5d75358b29a97c94))
* separate workflows ([3a61577](https://github.com/ubiquity-os/deno-deploy/commit/3a615777930bd73c070eb0692fe0f5b8a507736a))

## [1.3.0](https://github.com/ubiquity-os/deno-deploy/compare/v1.2.0...v1.3.0) (2025-06-27)


### Features

* deno deploy ([a87ced2](https://github.com/ubiquity-os/deno-deploy/commit/a87ced2c6c103614e1ed9a586c04faa1cf445493))


### Bug Fixes

* construct deployment URL directly for Deno Deploy ([6ab45ec](https://github.com/ubiquity-os/deno-deploy/commit/6ab45ecf890235fb826da3a042e9183bfd752b4d))
* removed `USER_` from ignored environment variables ([396c507](https://github.com/ubiquity-os/deno-deploy/commit/396c50797023d5106e50c9bd129b0d85aa785c2f))
* removed Deno code generation and added extra options for deployment ([c67d935](https://github.com/ubiquity-os/deno-deploy/commit/c67d93590593bbcfc498937b1be60d06a313bb52))
* sanitize project and branch names for Deno Deploy compliance ([af2d8b0](https://github.com/ubiquity-os/deno-deploy/commit/af2d8b04fba214990ce4dacb5d75358b29a97c94))
* separate workflows ([3a61577](https://github.com/ubiquity-os/deno-deploy/commit/3a615777930bd73c070eb0692fe0f5b8a507736a))

## [1.2.0](https://github.com/ubiquity-os/deno-deploy/compare/v1.1.0...v1.2.0) (2025-06-19)


### Features

* deno deploy ([a87ced2](https://github.com/ubiquity-os/deno-deploy/commit/a87ced2c6c103614e1ed9a586c04faa1cf445493))


### Bug Fixes

* construct deployment URL directly for Deno Deploy ([6ab45ec](https://github.com/ubiquity-os/deno-deploy/commit/6ab45ecf890235fb826da3a042e9183bfd752b4d))
* removed Deno code generation and added extra options for deployment ([c67d935](https://github.com/ubiquity-os/deno-deploy/commit/c67d93590593bbcfc498937b1be60d06a313bb52))
* sanitize project and branch names for Deno Deploy compliance ([af2d8b0](https://github.com/ubiquity-os/deno-deploy/commit/af2d8b04fba214990ce4dacb5d75358b29a97c94))
* separate workflows ([3a61577](https://github.com/ubiquity-os/deno-deploy/commit/3a615777930bd73c070eb0692fe0f5b8a507736a))

## [1.1.0](https://github.com/ubiquity-os/deno-deploy/compare/v1.0.0...v1.1.0) (2025-06-13)


### Features

* deno deploy ([a87ced2](https://github.com/ubiquity-os/deno-deploy/commit/a87ced2c6c103614e1ed9a586c04faa1cf445493))

## 1.0.0 (2025-05-30)


### Features

* deno deploy ([a87ced2](https://github.com/ubiquity-os/deno-deploy/commit/a87ced2c6c103614e1ed9a586c04faa1cf445493))
