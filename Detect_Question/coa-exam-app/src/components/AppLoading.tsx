'use client';

import React from 'react';
import { Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

export interface AppLoadingProps {
  tip?: React.ReactNode;
  subtitle?: React.ReactNode;
  size?: 'small' | 'default' | 'large';
  fullPage?: boolean;
  spinning?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export const AppLoading: React.FC<AppLoadingProps> = ({
  tip = 'Đang tải dữ liệu...',
  subtitle = 'Vui lòng đợi trong giây lát...',
  size = 'large',
  fullPage = false,
  spinning = true,
  children,
  className = '',
}) => {
  // Chỉ đúng 1 spinner Ant Design duy nhất, chuẩn mực và tinh gọn
  const singleIndicator = (
    <LoadingOutlined
      style={{
        fontSize: size === 'small' ? 24 : size === 'large' ? 38 : 30,
        color: '#2563eb',
      }}
      spin
    />
  );

  // Nếu dùng dạng bọc component con
  if (children) {
    return (
      <Spin
        spinning={spinning}
        indicator={singleIndicator}
        tip={tip}
        size={size}
        className={className}
      >
        {children}
      </Spin>
    );
  }

  // Dạng hiển thị độc lập (Full page / Container loading)
  return (
    <div
      className={`flex-1 w-full flex flex-col items-center justify-center p-6 sm:p-12 transition-all ${
        fullPage ? 'min-h-[65vh]' : 'min-h-[260px]'
      } ${className}`}
    >
      <div className="flex flex-col items-center text-center max-w-sm bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
        {/* Chỉ 1 vòng loading xoay duy nhất */}
        <div className="mb-4 flex items-center justify-center">
          <Spin indicator={singleIndicator} spinning={true} />
        </div>

        {/* Tiêu đề trạng thái */}
        {tip && (
          <div className="text-slate-900 font-bold text-sm sm:text-base tracking-tight mb-1">
            {tip}
          </div>
        )}

        {/* Phụ đề hướng dẫn */}
        {subtitle && (
          <div className="text-slate-500 text-xs font-normal leading-relaxed">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};
