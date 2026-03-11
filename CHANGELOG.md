# Changelog

## [1.7.0](https://github.com/ubiquity-os/deno-deploy/compare/v1.6.1...v1.7.0) (2026-03-11)


### Features

* **ci:** move manifest updates to artifact branches ([2616da8](https://github.com/ubiquity-os/deno-deploy/commit/2616da80185ef6ac5cae1208836790032facc39d))


### Bug Fixes

* do not fail delete when artifact branch is already absent ([59c61b5](https://github.com/ubiquity-os/deno-deploy/commit/59c61b53d7128d2dc8b436da3e1e2beebfd9a87a))
* skip dist and tag refs in deploy action ([#26](https://github.com/ubiquity-os/deno-deploy/issues/26)) ([e72e184](https://github.com/ubiquity-os/deno-deploy/commit/e72e184943435473f7920fc204c1f2939af48b50))
* tolerate missing artifact branch during delete ([667afa4](https://github.com/ubiquity-os/deno-deploy/commit/667afa4abaa42b3d013605fe01bf26fc6e13a150))

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
