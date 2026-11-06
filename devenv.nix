{ pkgs, ... }:
{
  packages = [ pkgs.gh pkgs.zip ];
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
    npm.enable = true;
  };
  scripts.check.exec = "npm run check";
}
