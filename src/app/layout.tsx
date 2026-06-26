import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: '高考志愿填报顾问 v0',
  description: '就业导向的高考志愿填报助手：冲/稳/保分层推荐 + AI 方案生成。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="topbar">
          <div className="brand">
            🎓 高考志愿填报顾问 <span className="ver">v0</span>
          </div>
          <nav>
            <Link href="/">志愿匹配</Link>
            <Link href="/search">院校查询</Link>
            <Link href="/chat">AI 聊天</Link>
            <Link href="/data">数据与更新</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
        <footer className="foot">
          v0 演示 · 数据为模拟样本，仅供产品演示，切勿用于真实填报决策。
        </footer>
      </body>
    </html>
  );
}
