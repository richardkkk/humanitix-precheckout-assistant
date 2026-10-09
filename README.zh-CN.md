# Humanitix 预结账助手

[English](README.md) | 简体中文

这是一个本地 Tampermonkey 用户脚本，用于准备 Humanitix 订单、等待已配置的开售时间，并停在钱包最终确认之前。

## 功能

- 第一次使用时填写姓名、邮箱、手机、学生 ID 和学生类型
- 个人资料仅保存在用户自己的 Tampermonkey 存储中
- 只有一个可购买票种时自动选择 1 张
- 有多个可购买票种时高亮并要求用户手动选择
- 自动填写已识别的购买人和学生信息；遇到未知必填项会停止提醒
- 默认取消 Humanitix 推广邮件
- 自动读取页面显示的 `Sales start at ...` 开售时间，到点只刷新一次
- 首次设置时可选择 Google Pay、Apple Pay、信用卡、PayPal 或只停在付款页
- Google Pay 或 Apple Pay 原生窗口必须由用户亲手点击打开
- 不会确认钱包中的最终付款

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)，并在浏览器扩展设置中允许用户脚本。
2. 打开[脚本安装链接](https://raw.githubusercontent.com/richardkkk/humanitix-precheckout-assistant/main/userscript/humanitix-precheckout.user.js)。
3. 在 Tampermonkey 中确认安装。
4. 打开任意 Humanitix 活动页面，首次设置窗口会要求用户填写自己的资料。
5. 未配置自动倒计时的活动，点击右下角 **启动当前活动**。

## 票种选择

脚本不依赖票种名称或固定位置。只有一个可用数量控件时自动选择一张；如果有多个，会高亮所有选项。用户把其中一个设为 1 张后，点击 **已选好，继续**。

## 定时开售

普通活动不需要配置。票务页面显示类似 `Sales start at Mon 12th Oct 2026, 12:00 pm AEDT` 的文字时，脚本会自动读取日期、时间和 AEST/AEDT 时区。提前打开页面就会自动倒计时，Chrome 和标签页需要保持打开。

页面显示的开售时间优先；如果主办方修改时间，刷新页面即可读取新时间。脚本不会高频轮询 Humanitix。

只有页面没有可读取的开售时间时，才需要通过 Tampermonkey 菜单中的 **高级：编辑完整 JSON 配置** 添加备用配置：

```json
{
  "id": "event-name",
  "url": "https://events.humanitix.com/event-slug",
  "releaseAt": "2026-10-12T12:00:00+11:00",
  "expectedPriceAud": 15
}
```

普通的 Humanitix 定时开售页面不需要填写这段 JSON。

## 付款边界

浏览器原生钱包要求前台标签页和真实用户手势。脚本会准备好付款区域并显示 **打开 Google Pay** 或 **打开 Apple Pay**，这一步需要用户亲手点击；钱包中的最终确认也必须由用户完成。Apple Pay 只有在 Humanitix 于兼容的 Apple/Safari 环境中显示该选项时才能使用，Windows Chrome 通常不会显示。信用卡和 PayPal 会停在对应付款区域，由用户手动完成。

## 隐私

个人资料只保存在用户浏览器的 Tampermonkey 存储中。仓库不包含个人资料、分析代码、后端服务或数据收集。

## 注意

这是非官方工具，与 Humanitix、UNSW 或 Arc 无关。Humanitix 条款可能限制自动访问。脚本不包含验证码绕过、隐身、快速轮询或反机器人规避功能。使用者应自行遵守活动主办方规则和相关条款。

## 开发测试

```powershell
npm test
```

MIT License。
