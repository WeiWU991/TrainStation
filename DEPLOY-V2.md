# 🚀 V2 部署指南 - 超简化版

## 📦 部署包包含文件

✅ **server.js** - 服务器程序（必须上传）
✅ **package.json** - 配置文件（必须上传）
✅ **stations.json** - 50个车站数据（必须上传）
✅ **.gitignore** - Git 配置（必须上传）

⚠️ **重要：这次有 4 个文件，都要上传！**

---

## 🎯 部署步骤（与 V1 完全相同）

### 第 1 步：注册账号（如已完成可跳过）

1. **GitHub**: https://github.com/signup
2. **Railway**: https://railway.app （用 GitHub 登录）

---

### 第 2 步：创建 GitHub 仓库

1. 访问：https://github.com/new
2. 仓库名称输入：`train-board-v2`
3. 选择 **Private**（私有）
4. 点击 **"Create repository"**

---

### 第 3 步：上传文件

1. 在新仓库页面，点击 **"uploading an existing file"** 链接

2. **拖拽或选择这 4 个文件：**
   - ✅ server.js
   - ✅ package.json
   - ✅ stations.json ⭐ **新增，别忘了！**
   - ✅ .gitignore

3. 在底部输入：`Initial commit`

4. 点击 **"Commit changes"**

✅ **确认：** 您应该看到 4 个文件都在仓库中

---

### 第 4 步：在 Railway 部署

1. 访问：https://railway.app/dashboard

2. 点击 **"+ New Project"**

3. 选择 **"Deploy from GitHub repo"**

4. 选择 `train-board-v2` 仓库

5. Railway 自动开始部署，等待 2-3 分钟

6. 看到绿色 ✓ 表示成功！

---

### 第 5 步：获取访问地址

1. 点击您的服务（train-board-v2）

2. 进入 **Settings** 标签

3. 找到 **"Generate Domain"** 按钮，点击

4. 复制生成的域名，类似：
   ```
   train-board-v2-production-xxxx.up.railway.app
   ```

---

### 第 6 步：测试 V2 功能

#### 测试 1：健康检查
```
https://您的域名.up.railway.app/health
```
应该看到：
```json
{
  "status": "ok",
  "totalStations": 50,
  "countries": ["IT", "NL", "DE", "CH", "UK", "FR"]
}
```

#### 测试 2：搜索车站（新功能）
```
https://您的域名.up.railway.app/stations/search?q=milan
```
应该看到米兰车站的搜索结果

#### 测试 3：车站列表（新功能）
```
https://您的域名.up.railway.app/stations/list?country=IT
```
应该看到意大利所有 10 个车站

#### 测试 4：出发看板
```
https://您的域名.up.railway.app/board?station=milano-centrale
```
应该看到米兰中央车站的实时出发看板

🎉 **如果上面都能正常显示，恭喜！V2 部署成功！**

---

## 🌐 绑定自定义域名（可选）

如果想用 `board.raileurop.cn`:

1. 在 Railway 项目 Settings 中
2. 添加域名：`board.raileurop.cn`
3. Railway 会给您一个 CNAME 记录
4. 去您的域名管理后台添加这条记录
5. 等待 5-30 分钟生效

---

## 📱 在微信小程序中使用

### V2 新用法（推荐）：

```javascript
// 使用车站 slug
<web-view src="https://board.raileurop.cn/board?station=milano-centrale"></web-view>

// 支持的所有车站 slugs：
// 意大利：milano-centrale, roma-termini, venezia-santa-lucia, ...
// 荷兰：amsterdam-centraal, rotterdam-centraal, utrecht-centraal, ...
// 德国：berlin-hauptbahnhof, munchen-hauptbahnhof, frankfurt-hauptbahnhof, ...
// 瑞士：zurich-hb, geneve, bern, ...
// 英国：london-euston, london-victoria, manchester-piccadilly, ...
// 法国：paris-gare-du-nord, paris-gare-de-lyon, lyon-part-dieu, ...
```

### 向后兼容（V1 语法仍然有效）：

```javascript
// 旧的 V1 语法（但只支持少数几个城市）
<web-view src="https://board.raileurop.cn/board?city=milan"></web-view>
```

---

## 🆕 V2 特色功能示例

### 功能 1：动态搜索车站

```javascript
// 小程序中实现搜索功能
Page({
  data: {
    searchQuery: '',
    searchResults: []
  },
  
  onSearch(e) {
    const query = e.detail.value;
    
    wx.request({
      url: `https://board.raileurop.cn/stations/search?q=${query}`,
      success: (res) => {
        this.setData({
          searchResults: res.data.results
        });
      }
    });
  },
  
  selectStation(e) {
    const slug = e.currentTarget.dataset.slug;
    wx.navigateTo({
      url: `/pages/board/board?station=${slug}`
    });
  }
});
```

### 功能 2：按国家显示车站列表

```javascript
// 获取某个国家的所有车站
wx.request({
  url: 'https://board.raileurop.cn/stations/list?country=IT',
  success: (res) => {
    console.log(`意大利共有 ${res.data.totalStations} 个车站`);
    this.setData({
      stations: res.data.stations
    });
  }
});
```

---

## ✅ 部署检查清单

完成部署前，请确认：

- [ ] GitHub 仓库创建成功
- [ ] 4 个文件都已上传（特别是 stations.json）
- [ ] Railway 部署显示绿色 ✓
- [ ] 域名已生成
- [ ] `/health` 显示 50 个车站
- [ ] `/stations/search?q=milan` 能搜索到车站
- [ ] `/board?station=milano-centrale` 能显示看板

---

## 🆘 常见问题

### Q: Railway 部署失败？
**A:** 检查是否上传了所有 4 个文件，特别是 `stations.json`

### Q: `/health` 显示只有 20 个车站？
**A:** 说明 `stations.json` 没有正确上传，重新上传该文件

### Q: 搜索功能返回空结果？
**A:** 检查 `stations.json` 是否存在且格式正确

### Q: 某个车站的看板打不开？
**A:** 可能是该国家的铁路网站临时故障，稍后重试

---

## 📊 V2 支持的所有 50 个车站

完整列表请访问：
```
https://您的域名.up.railway.app/stations/list
```

或查看 `stations.json` 文件

---

## 💰 费用提醒

Railway 免费额度：
- 每月 $5 美元
- 500 小时运行时间
- 对于 V2 来说完全够用

查看用量：Railway 控制台 → Account Settings → Usage

---

## 📞 部署遇到问题？

如果卡住了：

1. **截图当前页面**
2. **说明进行到哪一步**
3. **描述看到的错误**

我会立即帮您解决！

---

## 🎉 部署成功后

您将拥有：
- ✅ 一个支持 50+ 车站的代理服务器
- ✅ 覆盖 6 个欧洲国家
- ✅ 智能搜索功能
- ✅ 完整的 REST API
- ✅ 随时可以添加更多车站

**开始部署吧！** 预计 15-20 分钟完成 🚀

---

**V2 部署包位置：** [点击下载](computer:///mnt/user-data/outputs/train-board-v2-deploy/)

**需要帮助随时联系我！** 🚄✨
