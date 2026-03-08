/**
 * TEMPLATE: Adapter pour une source de données
 *
 * Utilisation:
 * 1. Copier ce fichier dans apps/web/src/app/components/tabs/data-sources/adapters/
 *    et le renommer en MySourceAdapter.ts (ou le nom de votre type).
 * 2. Remplacer MySourceAdapter et 'my-source-id' par votre type.
 * 3. Implémenter testConnection() (obligatoire) et optionnellement query(), connect(), disconnect().
 * 4. Enregistrer l'adapter dans adapters/index.ts: import + entrée dans getAdapterForType().
 */

import { BaseAdapter } from './BaseAdapter';
import { TestConnectionResult } from '../types';

export class MySourceAdapter extends BaseAdapter {
  async testConnection(): Promise<TestConnectionResult> {
    try {
      const validation = this.validateConfig();
      if (!validation.valid) {
        return this.createErrorResult(validation.errors.join(', '));
      }

      const endpoint = this.getConfig<string>('endpoint');
      const apiKey = this.getConfig<string>('apiKey');

      if (!endpoint) {
        return this.createErrorResult('Endpoint is required');
      }

      // TODO: réaliser le test de connexion (fetch, ping, etc.)
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
      });

      if (!response.ok) {
        return this.createErrorResult(`HTTP ${response.status}: ${response.statusText}`);
      }

      return this.createSuccessResult('Connection successful', {
        endpoint,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return this.createErrorResult(error);
    }
  }

  // Optionnel: requêter des données
  // async query(query: string, request?: any): Promise<any> {
  //   const endpoint = this.getConfig<string>('endpoint');
  //   const res = await fetch(`${endpoint}/query`, { method: 'POST', body: JSON.stringify({ query }) });
  //   if (!res.ok) throw new Error(await res.text());
  //   return res.json();
  // }
}
