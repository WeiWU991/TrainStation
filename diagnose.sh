#!/bin/bash
# Railway 部署诊断脚本

echo "=========================================="
echo "Railway 部署完整诊断"
echo "=========================================="
echo ""

# 1. 检查 Node.js 版本
echo "1️⃣ Node.js 版本检查"
node --version
npm --version
echo ""

# 2. 检查所有文件是否存在
echo "2️⃣ 必需文件检查"
for file in package.json package-lock.json server.js stations.json index.html; do
  if [ -f "$file" ]; then
    echo "  ✓ $file 存在 ($(du -h "$file" | cut -f1))"
  else
    echo "  ✗ $file 缺失！"
  fi
done
echo ""

# 3. 检查 package.json 依赖
echo "3️⃣ package.json 依赖"
cat package.json | jq -r '.dependencies | to_entries[] | "  \(.key): \(.value)"'
echo ""

# 4. 安装依赖
echo "4️⃣ 安装依赖"
npm ci --only=production 2>&1 | tail -5
echo ""

# 5. 检查安装的包
echo "5️⃣ 已安装的关键包"
for pkg in express axios cheerio express-rate-limit; do
  if [ -d "node_modules/$pkg" ]; then
    version=$(cat "node_modules/$pkg/package.json" | jq -r '.version')
    echo "  ✓ $pkg@$version"
  else
    echo "  ✗ $pkg 未安装！"
  fi
done
echo ""

# 6. 检查 server.js 语法
echo "6️⃣ server.js 语法检查"
node -c server.js && echo "  ✓ 语法正确" || echo "  ✗ 语法错误！"
echo ""

# 7. 检查 stations.json 格式
echo "7️⃣ stations.json 格式检查"
cat stations.json | jq 'length' > /dev/null 2>&1
if [ $? -eq 0 ]; then
  count=$(cat stations.json | jq 'length')
  echo "  ✓ JSON 格式正确，共 $count 个车站"
else
  echo "  ✗ JSON 格式错误！"
fi
echo ""

# 8. 尝试启动服务器（5秒超时）
echo "8️⃣ 服务器启动测试"
timeout 5 node server.js > /tmp/server-test.log 2>&1 &
PID=$!
sleep 3

# 9. 测试健康检查
echo "9️⃣ 健康检查测试"
curl -s -m 2 http://localhost:3000/health 2>&1 | head -3
if [ $? -eq 0 ]; then
  echo "  ✓ 健康检查成功"
else
  echo "  ✗ 健康检查失败"
fi
echo ""

# 10. 检查服务器日志
echo "🔟 服务器启动日志"
cat /tmp/server-test.log
echo ""

# 清理
kill $PID 2>/dev/null

echo "=========================================="
echo "诊断完成！"
echo "=========================================="
