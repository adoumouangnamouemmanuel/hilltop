`sample.heic` is the unmodified `examples/example.heic` test image from
[strukturag/libheif](https://github.com/strukturag/libheif/blob/master/examples/example.heic),
downloaded on 2 November 2026. It is used only to test real HEIC decoding in Chromium.
The upstream project is distributed under the [LGPL](https://github.com/strukturag/libheif/blob/master/COPYING).

The decoder is the pinned `heic-to` dependency, loaded from its CSP build. No external
conversion service receives user photos. Run `npm run test:browser -w @hilltop/web`.
