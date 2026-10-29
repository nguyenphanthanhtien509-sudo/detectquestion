import type { Metadata } from 'next';
import { Roboto } from 'next/font/google';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import './globals.css';
import { AppSidebar } from '../components/AppSidebar';

const roboto = Roboto({
  weight: ['300', '400', '500', '700'],
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-roboto',
});

export const metadata: Metadata = {
  title: 'Hệ Thống Ôn Thi Trắc Nghiệm Kiến Trúc Máy Tính',
  description: 'Ôn luyện 6 chương trắc nghiệm và bài tập Kiến trúc máy tính & Hợp ngữ chuẩn hóa.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={roboto.variable}>
      <body className={`${roboto.className} bg-slate-50 text-slate-800 antialiased selection:bg-blue-100 selection:text-blue-900 min-h-screen`}>
        <AntdRegistry>
          <ConfigProvider
            locale={viVN}
            theme={{
              token: {
                colorPrimary: '#2563eb', // Blue 600
                colorInfo: '#2563eb',
                colorSuccess: '#10b981', // Emerald 500
                colorWarning: '#f59e0b', // Amber 500
                colorError: '#ef4444', // Red 500
                borderRadius: 8,
                wireframe: false,
                fontFamily: "var(--font-roboto), 'Roboto', system-ui, -apple-system, sans-serif",
                colorBgBase: '#ffffff',
                colorTextBase: '#0f172a',
              },
            }}
          >
            <div className="flex min-h-screen">
              <AppSidebar />
              <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
                {children}
              </div>
            </div>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
