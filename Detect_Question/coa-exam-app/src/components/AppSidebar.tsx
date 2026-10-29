'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Tooltip, Badge } from 'antd';
import {
  HomeOutlined,
  BookOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  HistoryOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlayCircleOutlined,
  DesktopOutlined,
} from '@ant-design/icons';
import { getActiveSession } from '../utils/quizStorage';

export const AppSidebar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(false);

  // Kiểm tra phiên làm bài dở
  useEffect(() => {
    const s = getActiveSession();
    setHasActiveSession(!!s && !s.isCompleted);
  }, [pathname]);

  const navItems = [
    {
      href: '/',
      label: 'Trang chủ',
      icon: <HomeOutlined className="text-lg" />,
      match: (p: string) => p === '/',
    },
    {
      href: '/exam-modes',
      label: 'Chế độ thi',
      icon: <ThunderboltOutlined className="text-lg" />,
      match: (p: string) => p.startsWith('/exam-modes'),
    },
    {
      href: '/bank',
      label: 'Ngân hàng câu hỏi',
      icon: <SearchOutlined className="text-lg" />,
      match: (p: string) => p.startsWith('/bank'),
    },
    {
      href: '/history',
      label: 'Lịch sử thi',
      icon: <HistoryOutlined className="text-lg" />,
      match: (p: string) => p.startsWith('/history'),
    },
  ];

  return (
    <aside
      className={`sticky top-0 h-screen bg-white border-r border-slate-200 shadow-xs z-50 flex flex-col justify-between transition-all duration-300 shrink-0 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Top Header / Brand */}
      <div>
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-100">
          {!collapsed ? (
            <Link
              href="/"
              className="flex items-center gap-2.5 no-underline text-inherit cursor-pointer select-none"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-base shadow-xs cursor-pointer">
                <DesktopOutlined />
              </div>
              <div>
                <div className="font-extrabold text-slate-900 text-sm tracking-tight leading-none cursor-pointer">
                  Kiến Trúc Máy Tính
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 leading-none cursor-pointer">
                  Ôn thi trắc nghiệm
                </div>
              </div>
            </Link>
          ) : (
            <Link
              href="/"
              className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-base shadow-xs cursor-pointer mx-auto"
            >
              <DesktopOutlined />
            </Link>
          )}

          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            className="text-slate-500 hover:text-blue-600 hover:bg-slate-100 cursor-pointer"
            title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          />
        </div>

        {/* Menu Items */}
        <nav className="p-3 space-y-1.5">
          {navItems.map(item => {
            const isActive = item.match(pathname);
            const content = (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all cursor-pointer no-underline select-none ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                }`}
              >
                <span className={`shrink-0 cursor-pointer ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
                  {item.icon}
                </span>
                {!collapsed && (
                  <span className="text-sm cursor-pointer whitespace-nowrap">
                    {item.label}
                  </span>
                )}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href} placement="right" title={item.label}>
                  {content}
                </Tooltip>
              );
            }

            return content;
          })}
        </nav>
      </div>

      {/* Bottom Actions */}
      <div className="p-3 border-t border-slate-100 space-y-2">
        {hasActiveSession && (
          <Tooltip title={collapsed ? 'Làm tiếp bài dở' : ''} placement="right">
            <Button
              type="default"
              block
              danger
              icon={<PlayCircleOutlined />}
              onClick={() => router.push('/exam')}
              className="bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 font-semibold cursor-pointer h-10"
            >
              {!collapsed && 'Làm tiếp bài dở'}
            </Button>
          </Tooltip>
        )}

        <Tooltip title={collapsed ? 'Thi thử cuối kỳ' : ''} placement="right">
          <Button
            type="primary"
            block
            icon={<ThunderboltOutlined />}
            onClick={() => router.push('/exam?mode=cumulative')}
            className="bg-blue-600 hover:bg-blue-700 shadow-sm font-semibold cursor-pointer h-10"
          >
            {!collapsed && 'Thi thử cuối kỳ'}
          </Button>
        </Tooltip>
      </div>
    </aside>
  );
};
