/**
 * Routing Service - Rules Engine
 * Handles rule-based routing of records to destinations
 */

const { supabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class RoutingService {
    constructor() {
        this.connectors = new Map();
    }

    registerConnector(name, connector) {
        this.connectors.set(name, connector);
    }

    async processRecord(record) {
        try {
            console.log('Processing record:', record.id);

            // Get matching routes
            const routes = await this.getMatchingRoutes(record);
            
            // Process each route
            const deliveries = [];
            
            for (const route of routes) {
                for (const action of route.action) {
                    const delivery = await this.createDelivery(record, route, action);
                    deliveries.push(delivery);
                }
            }

            // Execute deliveries
            await this.executeDeliveries(deliveries);

            return {
                record_id: record.id,
                routes_matched: routes.length,
                deliveries_created: deliveries.length,
                deliveries: deliveries.map(d => ({
                    id: d.id,
                    connector: d.connector,
                    target: d.target,
                    status: d.status
                }))
            };
        } catch (error) {
            console.error('Record processing error:', error);
            throw error;
        }
    }

    async getMatchingRoutes(record) {
        const { data: routes, error } = await supabase
            .from('routes')
            .select('*')
            .eq('tenant_id', record.tenant_id)
            .eq('enabled', true)
            .order('priority', { ascending: false });

        if (error) throw error;

        const matchingRoutes = [];
        
        for (const route of routes) {
            if (this.matchesRule(record, route.match)) {
                matchingRoutes.push(route);
            }
        }

        return matchingRoutes;
    }

    matchesRule(record, matchConditions) {
        for (const [key, condition] of Object.entries(matchConditions)) {
            if (!this.evaluateCondition(record, key, condition)) {
                return false;
            }
        }
        return true;
    }

    evaluateCondition(record, key, condition) {
        const recordValue = this.getNestedValue(record, key);
        
        if (typeof condition === 'string' || typeof condition === 'number' || typeof condition === 'boolean') {
            return recordValue === condition;
        }
        
        if (Array.isArray(condition)) {
            return condition.includes(recordValue);
        }
        
        if (typeof condition === 'object' && condition !== null) {
            for (const [op, value] of Object.entries(condition)) {
                if (!this.evaluateOperator(recordValue, op, value)) {
                    return false;
                }
            }
            return true;
        }
        
        return false;
    }

    evaluateOperator(recordValue, operator, value) {
        switch (operator) {
            case '>':
                return recordValue > value;
            case '<':
                return recordValue < value;
            case '>=':
                return recordValue >= value;
            case '<=':
                return recordValue <= value;
            case '!=':
                return recordValue !== value;
            case '=':
            case '==':
                return recordValue === value;
            case 'contains':
                return String(recordValue).toLowerCase().includes(String(value).toLowerCase());
            case 'in':
                return Array.isArray(value) && value.includes(recordValue);
            case 'not_in':
                return Array.isArray(value) && !value.includes(recordValue);
            case 'exists':
                return value ? recordValue != null : recordValue == null;
            default:
                throw new Error(`Unknown operator: ${operator}`);
        }
    }

    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : null;
        }, obj);
    }

    async createDelivery(record, route, action) {
        const idempotencyKey = await this.generateIdempotencyKey(
            record.tenant_id,
            record.id,
            route.id
        );

        // Check if delivery already exists
        const { data: existing } = await supabase
            .from('deliveries')
            .select('*')
            .eq('idempotency_key', idempotencyKey)
            .single();

        if (existing) {
            return existing;
        }

        const delivery = {
            id: uuidv4(),
            record_id: record.id,
            route_id: route.id,
            connector: action.connector,
            target: this.resolveTarget(action, record),
            idempotency_key: idempotencyKey,
            status: 'pending'
        };

        const { data, error } = await supabase
            .from('deliveries')
            .insert(delivery)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async generateIdempotencyKey(tenant_id, record_id, route_id) {
        const { data, error } = await supabase
            .rpc('generate_idempotency_key', {
                p_tenant_id: tenant_id,
                p_record_id: record_id,
                p_route_id: route_id
            });

        if (error) throw error;
        return data;
    }

    resolveTarget(action, record) {
        // Resolve template variables in target
        let target = action.destination_id || action.target;
        
        if (typeof target === 'string' && target.includes('{{')) {
            // Replace template variables
            target = target.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
                return this.getNestedValue(record, key.trim()) || match;
            });
        }

        return target;
    }

    async executeDeliveries(deliveries) {
        const promises = deliveries.map(delivery => this.executeDelivery(delivery));
        return Promise.allSettled(promises);
    }

    async executeDelivery(delivery) {
        try {
            // Update status to processing
            await this.updateDeliveryStatus(delivery.id, 'processing');

            const connector = this.connectors.get(delivery.connector);
            if (!connector) {
                throw new Error(`Connector not found: ${delivery.connector}`);
            }

            // Get the record for delivery
            const { data: record } = await supabase
                .from('records')
                .select('*, assignee:team_members(*)')
                .eq('id', delivery.record_id)
                .single();

            // Execute the connector
            const result = await connector.deliver(record, delivery);

            // Update status to succeeded
            await this.updateDeliveryStatus(delivery.id, 'succeeded', null, result);

            return { success: true, result };
        } catch (error) {
            console.error('Delivery error:', error);
            
            // Update status to failed
            await this.updateDeliveryStatus(delivery.id, 'failed', error.message);
            
            return { success: false, error: error.message };
        }
    }

    async updateDeliveryStatus(deliveryId, status, error = null, meta = null) {
        const updates = { 
            status, 
            updated_at: new Date().toISOString() 
        };
        
        if (error) updates.error = error;
        if (meta) updates.meta = meta;

        await supabase
            .from('deliveries')
            .update(updates)
            .eq('id', deliveryId);
    }

    async retryFailedDeliveries(tenantId, maxAge = '1 hour') {
        const { data: failedDeliveries, error } = await supabase
            .from('deliveries')
            .select('*, record:records(*), route:routes(*)')
            .eq('status', 'failed')
            .gte('created_at', `now() - interval '${maxAge}'`)
            .order('created_at', { ascending: true });

        if (error) throw error;

        console.log(`Retrying ${failedDeliveries.length} failed deliveries`);
        
        for (const delivery of failedDeliveries) {
            try {
                await this.executeDelivery(delivery);
            } catch (error) {
                console.error(`Retry failed for delivery ${delivery.id}:`, error);
            }
        }
    }
}

module.exports = { RoutingService };