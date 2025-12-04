function vuzonApp() {
  return {
    rules: [],
    destinations: [],
    loading: false,
    search: '',
    newRule: { localPart: '', destEmail: '' },
    newDestEmail: '',
    toasts: [],

    init() {
      this.refreshAll();
    },

    get verifiedDestinations() {
      return this.destinations.filter(d => d.verified);
    },

    get filteredRules() {
      if (!this.search) return this.rules;
      const q = this.search.toLowerCase();
      return this.rules.filter(r => {
        const name = (r.name || '').toLowerCase();
        const match = this.getRuleMatch(r).toLowerCase();
        const action = this.getRuleAction(r).toLowerCase();
        return name.includes(q) || match.includes(q) || action.includes(q);
      });
    },

    async refreshAll() {
      this.loading = true;
      try {
        await Promise.all([this.fetchDests(), this.fetchRules()]);
      } catch (e) {
        this.showToast('Error al actualizar datos', 'error');
      } finally {
        this.loading = false;
      }
    },

    async fetchDests() {
      const res = await fetch('/api/addresses');
      if (res.status === 401) return this.handleAuthError();
      const data = await res.json();
      if (data.success) this.destinations = data.result || [];
    },

    async fetchRules() {
      const res = await fetch('/api/rules');
      if (res.status === 401) return this.handleAuthError();
      const data = await res.json();
      if (data.success) this.rules = data.result || [];
    },

    async createRule() {
      if (!this.newRule.localPart || !this.newRule.destEmail) return;
      this.loading = true;
      try {
        const res = await fetch('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.newRule)
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
          this.showToast('Alias creado correctamente');
          this.newRule.localPart = '';
          if (data.result) {
            this.rules.unshift(data.result);
          } else {
            await this.fetchRules();
          }
        } else {
          throw new Error(data.error || data.errors?.[0]?.message || 'Error desconocido');
        }
      } catch (e) {
        this.showToast(e.message, 'error');
      } finally {
        this.loading = false;
      }
    },

    generateAlias() {
      this.newRule.localPart = Math.random().toString(36).slice(2, 10);
    },

    async toggleRule(rule) {
      const action = rule.enabled ? 'disable' : 'enable';
      const originalState = rule.enabled;
      
      rule.enabled = !rule.enabled;

      try {
        const res = await fetch(`/api/rules/${rule.id}/${action}`, { method: 'POST' });
        if (!res.ok) throw new Error();
        this.showToast(`Regla ${rule.enabled ? 'habilitada' : 'deshabilitada'}`);
      } catch (e) {
        rule.enabled = originalState;
        this.showToast('Error al cambiar estado', 'error');
      }
    },

    async deleteRule(id) {
      if (!confirm('¿Borrar este alias?')) return;
      try {
        const res = await fetch(`/api/rules/${id}`, { method: 'DELETE' });
        if (res.ok) {
          this.rules = this.rules.filter(r => r.id !== id);
          this.showToast('Alias eliminado');
        } else {
            this.showToast('Error al eliminar', 'error');
        }
      } catch (e) {
        this.showToast('Error de conexión', 'error');
      }
    },

    async addDestination() {
      if (!this.newDestEmail) return;
      try {
        const res = await fetch('/api/addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: this.newDestEmail })
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
          this.showToast('Destinatario añadido (verifica tu email)');
          this.newDestEmail = '';
          if (data.result) {
            this.destinations.unshift(data.result);
          } else {
            await this.fetchDests();
          }
        } else {
          this.showToast(data.error || 'Error al añadir', 'error');
        }
      } catch (e) {
        this.showToast('Error de conexión', 'error');
      }
    },

    async deleteDestination(id) {
      if (!confirm('¿Borrar destinatario?')) return;
      try {
        const res = await fetch(`/api/addresses/${id}`, { method: 'DELETE' });
        if (res.ok) {
            this.destinations = this.destinations.filter(d => d.id !== id);
            this.showToast('Destinatario eliminado');
        }
      } catch (e) {
        this.showToast('Error al eliminar', 'error');
      }
    },

    // --- NUEVO: Logout ---
    async logout() {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/logout';
      document.body.appendChild(form);
      form.submit();
    },

    handleAuthError() {
      window.location.href = '/login';
    },

    // Helpers UI
    getRuleName(rule) {
      return (rule.name && rule.name.length < 50) ? rule.name : this.getRuleMatch(rule);
    },
    getRuleMatch(rule) {
      return rule.matchers?.[0]?.value || 'Unknown';
    },
    getRuleAction(rule) {
      return rule.actions?.[0]?.value?.join(', ') || 'Drop';
    },
    copyToClipboard(text) {
      navigator.clipboard.writeText(text);
      this.showToast('Copiado al portapapeles');
    },
    showToast(message, type = 'success') {
      const id = Date.now();
      this.toasts.push({ id, message, type });
      setTimeout(() => {
        this.toasts = this.toasts.filter(t => t.id !== id);
      }, 3000);
    }
  }
}
