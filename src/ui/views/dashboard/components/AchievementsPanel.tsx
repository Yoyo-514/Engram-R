import {
  Activity,
  BrainCircuit,
  Cpu,
  Fingerprint,
  Flame,
  LibraryBig,
  MessageSquareText,
  Star,
  Trophy,
  Zap,
} from 'lucide-react';
import type { FC } from 'react';

import { type EngramSettings } from '@/config/settings';

interface AchievementsPanelProps {
  stats: EngramSettings['statistics'];
}

export const AchievementsPanel: FC<AchievementsPanelProps> = ({ stats }) => {
  // 处理大数字的美化显示
  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  // 计算入坑天数与活跃度
  const firstUseDate = stats.firstUseAt ? new Date(stats.firstUseAt) : new Date();
  const daysSinceFirstUse = Math.max(
    1,
    Math.floor((Date.now() - firstUseDate.getTime()) / (1000 * 60 * 60 * 24))
  );
  const activeDaysCount = stats.activeDays?.length || 1;
  const activeRatio = Math.min(100, Math.round((activeDaysCount / daysSinceFirstUse) * 100));

  return (
    <div className="space-y-6">
      <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Trophy size={14} className="text-amber-400" />
        全局统计与成就
      </h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* 1. 总 Token 消耗 (Resource) */}
        <div className="border-border/50 bg-muted/20 hover:border-primary/30 flex flex-col gap-2 rounded-xl border p-4 transition-colors">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              Token 消耗总计
            </span>
            <Cpu size={14} className="text-primary/70" />
          </div>
          <div className="flex items-end gap-1.5">
            <span className="font-mono text-2xl font-medium tracking-tight text-value">
              {formatNumber(stats.totalTokens)}
            </span>
            <span className="mb-1 text-[10px] text-muted-foreground shadow-sm">Tokens</span>
          </div>
        </div>

        {/* 2. LLM Invoke Count */}
        <div className="border-border/50 bg-muted/20 hover:border-primary/30 flex flex-col gap-2 rounded-xl border p-4 transition-colors">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-semibold uppercase tracking-wider">LLM 引擎调用</span>
            <MessageSquareText size={14} className="text-indigo-400/70" />
          </div>
          <div className="flex items-end gap-1.5">
            <span className="font-mono text-2xl font-medium tracking-tight text-value">
              {formatNumber(stats.totalLlmCalls)}
            </span>
            <span className="mb-1 text-[10px] text-muted-foreground shadow-sm">Calls</span>
          </div>
        </div>

        {/* 3. Event & Entity Creation (Productivity) */}
        <div className="border-border/50 bg-muted/20 hover:border-primary/30 flex flex-col gap-2 rounded-xl border p-4 transition-colors">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-semibold uppercase tracking-wider">系统记忆构建</span>
            <LibraryBig size={14} className="text-emerald-500/70" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-medium tracking-tight text-emerald-400">
              {formatNumber(stats.totalEvents)}
            </span>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Fingerprint size={10} />
              <span>{stats.totalEntities}</span>
            </div>
          </div>
        </div>

        {/* 4. RAG Injections & Retention */}
        <div className="border-border/50 bg-muted/20 hover:border-primary/30 flex flex-col gap-2 rounded-xl border p-4 transition-colors">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              RAG 上下文召回
            </span>
            <BrainCircuit size={14} className="text-amber-500/70" />
          </div>
          <div className="flex items-end gap-1.5">
            <span className="font-mono text-2xl font-medium tracking-tight text-amber-400">
              {formatNumber(stats.totalRagInjections)}
            </span>
            <span className="mb-1 text-[10px] text-muted-foreground shadow-sm">Times</span>
          </div>
        </div>
      </div>

      {/* 留存进度条 */}
      <div className="bg-muted/10 border-border/30 flex items-center gap-4 rounded-lg border p-3">
        <div className="bg-primary/10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-primary">
          <Activity size={16} />
        </div>
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">使用周期与活跃度</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {activeDaysCount} / {daysSinceFirstUse} 天 ({activeRatio}%)
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="from-primary/50 h-full bg-gradient-to-r to-primary transition-all duration-1000 ease-out"
              style={{ width: `${activeRatio}%` }}
            />
          </div>
        </div>

        {/* 徽章系统 (Badges) */}
        <div className="flex max-w-[50%] flex-shrink-0 flex-wrap items-center justify-end gap-2">
          {/* 1. 活跃度徽章 (Retention) */}
          {activeDaysCount >= 100 && activeRatio >= 50 ? (
            <div
              className="flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-500"
              title="连续活跃 100 天"
            >
              <Flame size={12} fill="currentColor" />
              百日陪伴
            </div>
          ) : activeDaysCount >= 30 && activeRatio >= 40 ? (
            <div
              className="flex items-center gap-1 rounded-full border border-rose-400/20 bg-rose-400/10 px-2 py-1 text-[10px] font-medium text-rose-400"
              title="连续活跃 30 天"
            >
              <Flame size={12} fill="currentColor" />
              忠实用户
            </div>
          ) : activeDaysCount >= 7 && activeRatio >= 30 ? (
            <div
              className="flex items-center gap-1 rounded-full border border-orange-400/20 bg-orange-400/10 px-2 py-1 text-[10px] font-medium text-orange-400"
              title="连续活跃 7 天"
            >
              <Flame size={12} />
              活跃初见
            </div>
          ) : null}

          {/* 2. Token 消耗徽章 (Resource) */}
          {stats.totalTokens >= 10000000 ? (
            <div
              className="flex items-center gap-1 rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-[10px] font-medium text-purple-500"
              title="消耗 1000 万 Token"
            >
              <Star size={12} fill="currentColor" />
              千万 Token
            </div>
          ) : stats.totalTokens >= 1000000 ? (
            <div
              className="flex items-center gap-1 rounded-full border border-purple-400/20 bg-purple-400/10 px-2 py-1 text-[10px] font-medium text-purple-400"
              title="消耗 100 万 Token"
            >
              <Star size={12} />
              百万 Token
            </div>
          ) : stats.totalTokens >= 100000 ? (
            <div
              className="flex items-center gap-1 rounded-full border border-purple-300/20 bg-purple-300/10 px-2 py-1 text-[10px] font-medium text-purple-300"
              title="消耗 10 万 Token"
            >
              <Star size={10} />
              十万 Token
            </div>
          ) : null}

          {/* 3. 记忆与实体徽章 (Productivity) */}
          {stats.totalEvents >= 10000 ? (
            <div
              className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-500"
              title="生成 10,000 条记忆"
            >
              <LibraryBig size={12} />
              万卷藏书
            </div>
          ) : stats.totalEvents >= 1000 ? (
            <div
              className="flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-medium text-emerald-400"
              title="生成 1,000 条记忆"
            >
              <LibraryBig size={12} />
              千思之录
            </div>
          ) : null}

          {/* 4. 召回频次徽章 (RAG) */}
          {stats.totalRagInjections >= 5000 ? (
            <div
              className="flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[10px] font-medium text-blue-500"
              title="成功召回 5,000 次"
            >
              <Zap size={12} fill="currentColor" />
              神经漫游者
            </div>
          ) : stats.totalRagInjections >= 1000 ? (
            <div
              className="flex items-center gap-1 rounded-full border border-blue-400/20 bg-blue-400/10 px-2 py-1 text-[10px] font-medium text-blue-400"
              title="成功召回 1,000 次"
            >
              <Zap size={12} />
              记忆编织者
            </div>
          ) : stats.totalRagInjections >= 100 ? (
            <div
              className="flex items-center gap-1 rounded-full border border-blue-300/20 bg-blue-300/10 px-2 py-1 text-[10px] font-medium text-blue-300"
              title="成功召回 100 次"
            >
              <Zap size={10} />
              初窥门径
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
