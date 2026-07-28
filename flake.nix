{
  description = "Dev Environment For Annotate Studio";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ rust-overlay.overlays.default ];
        };

        rustTools = with pkgs; [
          cargo
          rust-analyzer-unwrapped
          cargo-tauri
        ];

        nativeLibs = with pkgs; [
          pkg-config
          gobject-introspection
          glib.dev
          gtk3.dev
          cairo.dev
          pango.dev
          atk.dev
          gdk-pixbuf.dev
          harfbuzz.dev
          freetype.dev
          zlib.dev
          librsvg.dev
          dbus.dev
          openssl.dev
          libsoup_3.dev
          webkitgtk_4_1.dev
        ];
      
        pcPkgs = nativeLibs;
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = rustTools;
          nativeBuildInputs = nativeLibs;

          shellHook = ''
            export PKG_CONFIG_PATH="${
              pkgs.lib.concatStringsSep ":" (map (p: "${p}/lib/pkgconfig") pcPkgs)
            }"
            export LD_LIBRARY_PATH="${
              pkgs.lib.makeLibraryPath pcPkgs
            }"

            export PKG_CONFIG_ALLOW_SYSTEM_CFLAGS=1
            export PKG_CONFIG=$(which pkg-config)

            export OPENSSL_INCLUDE_DIR="${pkgs.openssl.dev}/include"
            export OPENSSL_LIB_DIR="${pkgs.openssl.out}/lib"
            export OPENSSL_ROOT_DIR="${pkgs.openssl.out}"
          '';
        };
      });
}
