# Homebrew cask for Zak. Lives in the tap repository github.com/guillaumevergano/homebrew-tap
# (Casks/zak.rb), so that: brew install --cask guillaumevergano/tap/zak
# scripts/update-packaging.mjs fills in the version and checksums after each release.
cask "zak" do
  arch arm: "arm64", intel: "x64"

  version "0.0.0"
  sha256 arm:   "0000000000000000000000000000000000000000000000000000000000000000",
         intel: "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/guillaumevergano/zak/releases/download/v#{version}/Zak-mac-#{arch}.dmg",
      verified: "github.com/guillaumevergano/zak/"
  name "Zak"
  desc "Calm desktop browser built on Chromium"
  homepage "https://hellozak.com/"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :monterey"

  app "Zak.app"

  zap trash: [
    "~/Library/Application Support/Zak",
    "~/Library/Caches/Zak",
    "~/Library/Preferences/app.zak.browser.plist",
    "~/Library/Saved Application State/app.zak.browser.savedState",
  ]
end
