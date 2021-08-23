## [1.1.7](https://github.com/Avallone-io/rls/compare/v1.1.6...v1.1.7) (2021-08-23)


### Bug Fixes

* typo ([189276a](https://github.com/Avallone-io/rls/commit/189276a7db7999d2a99f62bb75a90b4466637333))

## [1.1.6](https://github.com/Avallone-io/rls/compare/v1.1.5...v1.1.6) (2021-08-23)


### Bug Fixes

* **dependabot:** update config ([d4ff445](https://github.com/Avallone-io/rls/commit/d4ff445f67514aa430a9d44a35256d33b35f730d))

## [1.1.5](https://github.com/Avallone-io/rls/compare/v1.1.4...v1.1.5) (2021-08-02)


### Bug Fixes

* **manager:** use the right manager for repository ([c917d94](https://github.com/Avallone-io/rls/commit/c917d94f5f54c40135c0b9efc608c0fba37b8a80))

## [1.1.4](https://github.com/Avallone-io/rls/compare/v1.1.3...v1.1.4) (2021-07-20)


### Bug Fixes

* allow typeorm peer dep 0.2.31 ([2ecf206](https://github.com/Avallone-io/rls/commit/2ecf206a3a0e84c268ce49b6612f715dab0f7ba0))

## [1.1.3](https://github.com/Avallone-io/rls/compare/v1.1.2...v1.1.3) (2021-07-19)


### Bug Fixes

* add relation connection wrapper ([f521e3c](https://github.com/Avallone-io/rls/commit/f521e3c319c92fd8f30eda597fd39cf082729cd6))

## [1.1.2](https://github.com/Avallone-io/rls/compare/v1.1.1...v1.1.2) (2021-06-27)


### Bug Fixes

* update readme to reflect the nestjs module ([2174b61](https://github.com/Avallone-io/rls/commit/2174b61ccb693e6f52b77bd9952436f0629f6df6))

## [1.1.1](https://github.com/Avallone-io/rls/compare/v1.1.0...v1.1.1) (2021-06-26)


### Bug Fixes

* allow nestjs to import modules ([deed505](https://github.com/Avallone-io/rls/commit/deed505b49637cf83118184b174b89ed12446557))


### Performance Improvements

* use less queries ([0ebadeb](https://github.com/Avallone-io/rls/commit/0ebadeba1b7a6dc8ae6339eeca6e4f8d8aa44109))

# [1.1.0](https://github.com/Avallone-io/rls/compare/v1.0.2...v1.1.0) (2021-06-24)


### Bug Fixes

* update readme ([40be407](https://github.com/Avallone-io/rls/commit/40be40787a3dc08a7423446b8795c044f2f94a5e))
* update typeorm peer dep ([19c17f3](https://github.com/Avallone-io/rls/commit/19c17f3508d86804e193d11318a097a8ab0cde46))


### Features

* use forFeature as dynamic module ([0afbe90](https://github.com/Avallone-io/rls/commit/0afbe902c659c4350c9f00d176e031b3581720b0))

## [1.0.2](https://github.com/Avallone-io/rls/compare/v1.0.1...v1.0.2) (2021-06-23)


### Bug Fixes

* add dependabot config ([8318713](https://github.com/Avallone-io/rls/commit/8318713cb85990c15b20bd57245ed5ab3d0c0a56))
* deployment of dist ([99fc808](https://github.com/Avallone-io/rls/commit/99fc808f09e5ad97d44c03f5989d13f128be10a8))
* set global module ([1af15c7](https://github.com/Avallone-io/rls/commit/1af15c7d8958c367a04fdd6ba1a924463946ed36))
* update typeorm ([76a0b6e](https://github.com/Avallone-io/rls/commit/76a0b6e5a1516688cbab40b6a726789672475e8f))
* use build tsconfig ([3d04bf3](https://github.com/Avallone-io/rls/commit/3d04bf3f06aa06aedbe7abe561d2de9649b62955))

## [1.0.1](https://github.com/Avallone-io/rls/compare/v1.0.0...v1.0.1) (2021-06-03)


### Bug Fixes

* release to npm after changelog ([88b5a7d](https://github.com/Avallone-io/rls/commit/88b5a7d5d4671f24daed71b60749989406baa2b8))
* trigger license release ([071cfed](https://github.com/Avallone-io/rls/commit/071cfed7e013af83010b8b622956c29d0e6bf6ff))
* update pipeline ([8e4ae81](https://github.com/Avallone-io/rls/commit/8e4ae81a01a0b7b03b81d787f6df6c53e55a7793))

# 1.0.0 (2021-06-03)


### Bug Fixes

* add cleanup on each connection ([1c8ab3c](https://github.com/Avallone-io/rls/commit/1c8ab3c4f4892f2f12edd96706e1a9211cd66b1b))
* add connection to metadatas ([a8e930f](https://github.com/Avallone-io/rls/commit/a8e930f78bf1f20e2344852ca3595b1d4d5c0ee6))
* add utility function toJson ([6f3fb65](https://github.com/Avallone-io/rls/commit/6f3fb65c2d5f0e5d265b820ba186dcddf344ac90))
* allow testing with/without docker ([da3d043](https://github.com/Avallone-io/rls/commit/da3d0438b71a4d1ea1735b6a15829c6f6f8c16f9))
* don't allow to close virtual connection ([677f696](https://github.com/Avallone-io/rls/commit/677f6965b6f08f9c8fb6a835bf4b870ad38278a2))
* multiple connections and users ([74df27a](https://github.com/Avallone-io/rls/commit/74df27a1f634095a134e09034623dd614f110840))
* register the entities as providers ([0b46c5c](https://github.com/Avallone-io/rls/commit/0b46c5cba3d033db0ee514834fe7511cd4f870ad))
* remove the name from ormconfig ([95be582](https://github.com/Avallone-io/rls/commit/95be5826acb07d4236de7dd4eb7322126902b29e))
* run all tests ([a31716b](https://github.com/Avallone-io/rls/commit/a31716bb6aee33789e2980a2401cbdc546f2838a))
* security update on dependency ([92686cd](https://github.com/Avallone-io/rls/commit/92686cda36ef14ed7b12d3d0668d2ecd9795657c))
* update release pipeline ([c53853f](https://github.com/Avallone-io/rls/commit/c53853fd97372e984ca951d7f87ba02309d01590))
* update test utils ([d736eba](https://github.com/Avallone-io/rls/commit/d736ebacf7f73c793fe861f36df97c44c32a3007))


### Features

* add coverage report open script ([5204fcf](https://github.com/Avallone-io/rls/commit/5204fcfff5e04d678c6fa76d5612f9b765c13a43))
* add forRoot and and export providers ([ad387de](https://github.com/Avallone-io/rls/commit/ad387de1d938460f04e87a497102b344d65f3d73))
* add test configs ([85275cf](https://github.com/Avallone-io/rls/commit/85275cfd505988c05b77ef1bc0800438f1805923))
* export interfaces ([25de9a1](https://github.com/Avallone-io/rls/commit/25de9a1f4edb7496e851982523dac1029f3f893b))
* **rls:** add rls classes and modules ([b54acb0](https://github.com/Avallone-io/rls/commit/b54acb046764edd692e0a02c6d53b29966aaa7a2))
