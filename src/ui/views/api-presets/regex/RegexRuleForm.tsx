import { AlertCircle, CheckCircle, Info, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FC } from 'react';

/**
 * RegexRuleForm - 正则规则编辑表单
 */
import { REGEX_SCOPE_OPTIONS } from '@/config/regex/defaults';
import { RegexProcessor } from '@/modules/workflow/steps';
import type { RegexRule } from '@/types/regex';

interface RegexRuleFormProps {
  rule: RegexRule;
  onChange: (updates: Partial<RegexRule>) => void;
}

const FLAGS_OPTIONS = [
  { value: 'g', label: '全局匹配', description: '匹配所有结果' },
  { value: 'i', label: '忽略大小写', description: '不区分大小写' },
  { value: 'm', label: '多行模式', description: '^$ 匹配每行' },
  { value: 's', label: '点号匹配换行', description: '. 匹配换行符' },
];

export const RegexRuleForm: FC<RegexRuleFormProps> = ({ rule, onChange }) => {
  const [testInput, setTestInput] = useState('');
  const [testOutput, setTestOutput] = useState('');
  const [validation, setValidation] = useState<{ valid: boolean; error?: string }>({ valid: true });

  const processor = useMemo(() => new RegexProcessor(), []);

  // 验证正则表达式
  useEffect(() => {
    const result = processor.validatePattern(rule.pattern, rule.flags);
    setValidation(result);
  }, [rule.pattern, rule.flags, processor]);

  // 更新测试输出
  useEffect(() => {
    if (testInput && validation.valid) {
      const output = processor.processWithRule(testInput, rule);
      setTestOutput(output);
    } else {
      setTestOutput('');
    }
  }, [testInput, rule, validation.valid, processor]);

  const handleFlagToggle = (flag: string) => {
    const currentFlags = rule.flags.split('');
    const index = currentFlags.indexOf(flag);
    if (index >= 0) {
      currentFlags.splice(index, 1);
    } else {
      currentFlags.push(flag);
    }
    onChange({ flags: currentFlags.join('') });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 基本信息 */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">规则名称</label>
          <input
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            value={rule.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="例如：移除思维链"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">描述（可选）</label>
          <input
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            value={rule.description || ''}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="简短描述此规则的用途"
          />
        </div>

        {/* 作用域选择 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">作用域</label>
          <div className="flex gap-2">
            {REGEX_SCOPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                  rule.scope === opt.value
                    ? 'border-primary bg-primary-20 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                }`}
                onClick={() => onChange({ scope: opt.value })}
                title={opt.description}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {REGEX_SCOPE_OPTIONS.find((o) => o.value === rule.scope)?.description}
          </p>
        </div>
      </div>

      {/* 正则表达式 */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-foreground">正则表达式</label>
            {validation.valid ? (
              <CheckCircle size={14} className="text-value" />
            ) : (
              <AlertCircle size={14} className="text-destructive" />
            )}
          </div>
          <input
            type="text"
            className={`w-full rounded-md border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 ${
              validation.valid
                ? 'border-input focus:ring-ring'
                : 'border-destructive focus:ring-destructive'
            }`}
            value={rule.pattern}
            onChange={(e) => onChange({ pattern: e.target.value })}
            placeholder="例如：<think>[\s\S]*?</think>"
          />
          {!validation.valid && validation.error && (
            <p className="text-xs text-destructive">{validation.error}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">替换为</label>
          <input
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            value={rule.replacement}
            onChange={(e) => onChange({ replacement: e.target.value })}
            placeholder="留空表示删除匹配内容"
          />
        </div>

        {/* 标志选择 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">匹配选项</label>
          <div className="flex flex-wrap gap-2">
            {FLAGS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                  rule.flags.includes(opt.value)
                    ? 'border-primary bg-primary-20 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                }`}
                onClick={() => handleFlagToggle(opt.value)}
                title={opt.description}
              >
                {opt.label} ({opt.value})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 测试区域 */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted-20 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Play size={14} />
          测试正则
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">输入文本</label>
          <textarea
            className="min-h-[80px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder="在此输入测试文本，例如：&#10;<think>这是思考内容</think>&#10;正常对话内容"
          />
        </div>

        {testInput && validation.valid && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">处理结果</label>
            <div className="min-h-[60px] whitespace-pre-wrap rounded-md border border-border bg-background px-3 py-2 text-sm">
              {testOutput || <span className="italic text-muted-foreground">（无内容）</span>}
            </div>
          </div>
        )}
      </div>

      {/* 提示 */}
      <div className="bg-label/10 border-label/20 flex items-start gap-2 rounded-lg border p-3 text-sm text-label">
        <Info size={16} className="mt-0.5 shrink-0" />
        <div>
          <strong>输入</strong>：清洗发给 LLM 的聊天内容。
          <strong>输出</strong>：清洗 LLM 返回的内容（如移除{' '}
          <code className="bg-label/20 rounded px-1">&lt;think&gt;</code>）。
        </div>
      </div>
    </div>
  );
};
