/**
 * LLM Tools for AI Assistant
 * Tools define the contract between LLM and business logic
 */

const { supabase } = require('../config/database');

class ToolsService {
    constructor() {
        this.tools = [
            {
                name: 'resolve_person',
                description: 'Resolve person by name or alias to get their details',
                parameters: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'Person name or alias'
                        }
                    },
                    required: ['name']
                }
            },
            {
                name: 'route',
                description: 'Route a record through the rules engine',
                parameters: {
                    type: 'object',
                    properties: {
                        record: {
                            type: 'object',
                            description: 'Record to route'
                        }
                    },
                    required: ['record']
                }
            },
            {
                name: 'add_expense',
                description: 'Add an expense record',
                parameters: {
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'Expense title' },
                        amount: { type: 'number', description: 'Amount (negative for expense)' },
                        currency: { type: 'string', description: 'Currency code', default: 'RUB' },
                        body: { type: 'string', description: 'Additional details' },
                        tags: { type: 'array', items: { type: 'string' }, description: 'Tags' }
                    },
                    required: ['title', 'amount']
                }
            },
            {
                name: 'add_task',
                description: 'Add a task record',
                parameters: {
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'Task title' },
                        body: { type: 'string', description: 'Task description' },
                        assignee: { type: 'string', description: 'Assignee name' },
                        due_at: { type: 'string', description: 'Due date (ISO string)' },
                        tags: { type: 'array', items: { type: 'string' }, description: 'Tags' }
                    },
                    required: ['title']
                }
            },
            {
                name: 'add_bookmark',
                description: 'Add a bookmark record',
                parameters: {
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'Bookmark title' },
                        url: { type: 'string', description: 'URL' },
                        body: { type: 'string', description: 'Notes about the bookmark' },
                        tags: { type: 'array', items: { type: 'string' }, description: 'Tags' }
                    },
                    required: ['title', 'url']
                }
            },
            {
                name: 'search',
                description: 'Search records using full-text search',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Search query' },
                        kind: { type: 'string', description: 'Record type filter', enum: ['expense', 'task', 'bookmark'] },
                        limit: { type: 'integer', description: 'Max results', default: 10 }
                    },
                    required: ['query']
                }
            }
        ];
    }

    getTools() {
        return this.tools;
    }

    async executeTool(toolName, params, context) {
        const { tenant_id, user_id } = context;

        switch (toolName) {
            case 'resolve_person':
                return await this.resolvePerson(tenant_id, params.name);
            
            case 'route':
                return await this.routeRecord(tenant_id, params.record);
            
            case 'add_expense':
                return await this.addRecord(tenant_id, user_id, 'expense', params);
            
            case 'add_task':
                return await this.addRecord(tenant_id, user_id, 'task', params);
            
            case 'add_bookmark':
                return await this.addRecord(tenant_id, user_id, 'bookmark', params);
            
            case 'search':
                return await this.searchRecords(tenant_id, user_id, params);
            
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    async resolvePerson(tenant_id, name) {
        const { data, error } = await supabase
            .rpc('resolve_person', {
                p_tenant_id: tenant_id,
                p_name: name
            });

        if (error) throw error;
        return data[0] || null;
    }

    async routeRecord(tenant_id, record) {
        // Get matching routes ordered by priority
        const { data: routes, error } = await supabase
            .from('routes')
            .select('*')
            .eq('tenant_id', tenant_id)
            .eq('enabled', true)
            .order('priority', { ascending: false });

        if (error) throw error;

        const matchingRoutes = [];
        
        for (const route of routes) {
            if (this.matchesRule(record, route.match)) {
                matchingRoutes.push({
                    route_id: route.id,
                    actions: route.action
                });
            }
        }

        return matchingRoutes;
    }

    matchesRule(record, matchConditions) {
        for (const [key, condition] of Object.entries(matchConditions)) {
            const recordValue = record[key];
            
            if (typeof condition === 'string') {
                if (recordValue !== condition) return false;
            } else if (typeof condition === 'object') {
                // Handle operators like {"amount": {">": 1000}}
                for (const [op, value] of Object.entries(condition)) {
                    switch (op) {
                        case '>':
                            if (!(recordValue > value)) return false;
                            break;
                        case '<':
                            if (!(recordValue < value)) return false;
                            break;
                        case '>=':
                            if (!(recordValue >= value)) return false;
                            break;
                        case '<=':
                            if (!(recordValue <= value)) return false;
                            break;
                        case '!=':
                            if (recordValue === value) return false;
                            break;
                        default:
                            if (recordValue !== value) return false;
                    }
                }
            }
        }
        return true;
    }

    async addRecord(tenant_id, user_id, kind, params) {
        // Resolve assignee if provided
        let assignee_member_id = null;
        if (params.assignee) {
            const person = await this.resolvePerson(tenant_id, params.assignee);
            assignee_member_id = person?.member_id || null;
        }

        const record = {
            tenant_id,
            user_id,
            kind,
            title: params.title,
            body: params.body || null,
            amount: params.amount || null,
            currency: params.currency || 'RUB',
            due_at: params.due_at || null,
            url: params.url || null,
            tags: params.tags || [],
            assignee_member_id,
            meta: {}
        };

        const { data, error } = await supabase
            .from('records')
            .insert(record)
            .select()
            .single();

        if (error) throw error;

        // Route the record
        const routes = await this.routeRecord(tenant_id, data);
        
        return {
            record_id: data.id,
            routes_matched: routes.length,
            routes: routes
        };
    }

    async searchRecords(tenant_id, user_id, params) {
        try {
            const { data, error } = await supabase
                .rpc('search_records', {
                    p_tenant_id: tenant_id,
                    p_user_id: user_id,
                    p_query: params.query,
                    p_kind: params.kind || null,
                    p_limit: params.limit || 10
                });

            if (error) throw error;
            return data;
        } catch (error) {
            // Fallback to simple search if FTS function fails
            console.log('Using fallback search:', error.message);
            
            let query = supabase
                .from('records')
                .select('id, kind, title, body, created_at')
                .eq('tenant_id', tenant_id)
                .or(`title.ilike.%${params.query}%,body.ilike.%${params.query}%`)
                .order('created_at', { ascending: false })
                .limit(params.limit || 10);

            if (user_id) query = query.eq('user_id', user_id);
            if (params.kind) query = query.eq('kind', params.kind);

            const { data, error: fallbackError } = await query;
            
            if (fallbackError) throw fallbackError;
            
            return data.map(record => ({
                record_id: record.id,
                kind: record.kind,
                title: record.title,
                snippet: record.body ? record.body.substring(0, 200) : '',
                rank: 1.0
            }));
        }
    }
}

module.exports = { ToolsService };