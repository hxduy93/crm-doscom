# setup-geo-wp-secrets.ps1
# Set 6 secret WordPress cho GEO Monitor (2 agent: Doscom + Noma) trên Cloudflare Pages.
# Wrangler sẽ HỎI từng giá trị (không lưu vào file) -> an toàn, không lộ app password.
#
# Chạy:  cd C:\Users\HXDUy\crm-doscom ; .\scripts\setup-geo-wp-secrets.ps1
# Sau khi xong PHẢI deploy lại:  gh workflow run refresh-data.yml --ref master

$ErrorActionPreference = "Stop"
$project = "crm-doscom"

$secrets = @(
    "WP_DOSCOM_URL",      # vd: https://doscom.vn  (KHONG co / cuoi)
    "WP_DOSCOM_USER",     # vd: geo-agent
    "WP_DOSCOM_APP_PWD",  # Application Password cua doscom.vn
    "WP_NOMA_URL",        # vd: https://noma.vn
    "WP_NOMA_USER",       # vd: geo-agent
    "WP_NOMA_APP_PWD"     # Application Password cua noma.vn
)

Write-Host "== Set 6 secret WordPress cho project '$project' ==" -ForegroundColor Cyan
Write-Host "Wrangler se hoi tung gia tri. Nhan Enter de bo qua secret khong muon doi.`n"

foreach ($name in $secrets) {
    $val = Read-Host "Nhap gia tri cho $name (Enter = bo qua)"
    if ([string]::IsNullOrWhiteSpace($val)) {
        Write-Host "  -> bo qua $name`n" -ForegroundColor DarkGray
        continue
    }
    Write-Host "  -> dang set $name ..." -ForegroundColor Yellow
    $val | npx wrangler pages secret put $name --project-name=$project
    Write-Host ""
}

Write-Host "Xong. Deploy lai de secret co hieu luc:" -ForegroundColor Green
Write-Host "  gh workflow run refresh-data.yml --ref master" -ForegroundColor Green
