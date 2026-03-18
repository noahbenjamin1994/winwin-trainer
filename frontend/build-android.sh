#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "==> 构建静态页面..."
env $(cat .env.capacitor | xargs) npm run build

echo "==> 同步到 Android..."
npx cap sync

echo "==> 打开 Android Studio..."
npx cap open android
