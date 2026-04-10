/**
 * Native SillyTavern API Definitions.
 * Based on research into script.js, st-context.js, and events.js.
 */

declare interface SillyTavernContext {
    // Basic state
    readonly characters: SillyTavernCharacter[];
    readonly characterId: number | null;
    readonly chat: any[];
    readonly name1: string;
    readonly name2: string;
    readonly groupId: number | null;
    
    // Core Functions
    getRequestHeaders(options?: { omitContentType?: boolean }): Record<string, string>;
    saveSettingsDebounced(): void;
    saveChatConditional(): Promise<void>;
    executeSlashCommands(command: string): Promise<any>;
    
    // Services
    readonly eventSource: import('eventemitter').EventEmitter;
    readonly eventTypes: Record<string, string>;
    readonly variables: SillyTavernVariables;
    readonly macros: SillyTavernMacros;
}

declare interface SillyTavernCharacter {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    avatar: string;
    data: SillyTavernCharacterV2;
    extension_settings: Record<string, any>;
    extra_data: Record<string, any>;
}

declare interface SillyTavernCharacterV2 {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    system_prompt: string;
    post_history_instructions: string;
    extensions: {
        world?: string;
        depth_prompt?: {
            prompt: string;
            depth: number;
            role: string;
        };
        regex_scripts?: any[];
        [key: string]: any;
    };
    character_book?: any;
}

declare interface ChatMessage {
    name: string;
    mes: string;
    is_user: boolean;
    send_date?: string | number;
    force_avatar?: boolean;
    extra?: {
        type?: string;
        api?: string;
        model?: string;
        media?: any[];
        reasoning?: string;
        reasoning_signature?: string;
        reasoning_duration?: number;
        reasoning_type?: string;
        tool_invocations?: any[];
        swipes?: string[];
        [ignoreSymbol: symbol]: boolean;
        [key: string]: any;
    };
}

declare interface WorldInfoEntry {
    uid: number;
    key: string[];
    keysecondary: string[];
    selectiveLogic: number;
    content: string;
    depth: number;
    order: number;
    probability: number;
    sticky: number;
    cooldown: number;
    delay: number;
    [key: string]: any;
}

declare interface SillyTavernContext {
    readonly characters: SillyTavernCharacter[];
    readonly characterId: number | null;
    readonly chat: ChatMessage[];
    readonly name1: string;
    readonly name2: string;
    readonly groupId: number | null;
    readonly worldInfo: Record<string, any>;
    
    getRequestHeaders(options?: { omitContentType?: boolean }): Record<string, string>;
    saveSettingsDebounced(): void;
    saveChatConditional(): Promise<void>;
    executeSlashCommands(command: string): Promise<any>;
    
    readonly eventSource: import('eventemitter').EventEmitter;
    readonly eventTypes: Record<string, string>;
    readonly variables: SillyTavernVariables;
    readonly macros: SillyTavernMacros;
}
