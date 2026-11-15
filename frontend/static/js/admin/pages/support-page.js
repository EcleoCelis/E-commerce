(function () {
    function renderSupportPage() {
        const tickets = this.state.supportTickets || [];
        const currentFilter = this.state.supportStatusFilter || "all";
        const currentTicket = this.state.currentSupportTicket;
        const disabled = this.actionDisabledAttribute();

        const statusTabs = [
            { value: "all", label: "All Tickets" },
            { value: "open", label: "Open" },
            { value: "in_progress", label: "In Progress" },
            { value: "resolved", label: "Resolved" },
            { value: "closed", label: "Closed" },
        ].map((tab) => `
            <button type="button" class="admin-pill-filter ${currentFilter === tab.value ? "is-active" : ""}" onclick="adminApp.setSupportStatusFilter('${tab.value}')">
                ${this.escapeHtml(tab.label)}
            </button>
        `).join("");

        const rows = tickets.map((t) => `
            <tr>
                <td>
                    <button type="button" class="admin-order-link" onclick="adminApp.openSupportTicket('${this.escapeAttribute(t.ticket_number)}')">
                        #${this.escapeHtml(t.ticket_number)}
                    </button>
                </td>
                <td>
                    <strong>${this.escapeHtml(t.subject)}</strong>
                    <div class="admin-muted" style="text-transform: capitalize;">${this.escapeHtml(t.category || "general")}</div>
                </td>
                <td>
                    <strong>${this.escapeHtml(t.user_email || `Buyer #${t.user_id}`)}</strong>
                </td>
                <td>${this.statusBadge(t.status, (t.status || "").replace("_", " "))}</td>
                <td><span class="admin-muted">${this.escapeHtml(this.formatDate(t.updated_at || t.created_at))}</span></td>
                <td style="text-align: right;">
                    <div class="admin-inline-actions" style="justify-content: flex-end;">
                        <button type="button" class="admin-button-secondary admin-btn-sm" onclick="adminApp.openSupportTicket('${this.escapeAttribute(t.ticket_number)}')" ${disabled}>Inspect &amp; Reply</button>
                        ${t.status !== "resolved" ? `
                            <button type="button" class="admin-button-secondary admin-btn-sm admin-btn-subtle-success" onclick="adminApp.changeSupportTicketStatus('${this.escapeAttribute(t.ticket_number)}', 'resolved')" ${disabled}>Resolve</button>
                        ` : ""}
                    </div>
                </td>
            </tr>
        `).join("") || this.emptyTableRow("No support tickets found matching the selected filter.", 6);

        let ticketDrawer = "";
        if (currentTicket) {
            const messagesHtml = (currentTicket.messages || []).map((msg) => {
                const isStaff = Boolean(msg.is_staff ?? msg.is_staff_reply);
                return `
                <div class="admin-support-message ${isStaff ? "is-staff" : "is-buyer"}">
                    <div class="admin-support-message-header">
                        <strong>${this.escapeHtml(msg.sender_name || (isStaff ? "Store Admin" : "Buyer"))}</strong>
                        <span class="admin-muted">${this.escapeHtml(this.formatDate(msg.created_at))}</span>
                    </div>
                    <p class="admin-support-message-body">${this.escapeHtml(msg.message)}</p>
                </div>
            `;
            }).join("") || `<p class="admin-muted">No messages in this thread yet.</p>`;

            ticketDrawer = `
                <div class="admin-drawer-backdrop active" onclick="adminApp.closeSupportTicketDrawer()"></div>
                <aside class="admin-order-detail admin-order-drawer active" tabindex="-1" role="dialog" aria-modal="true" aria-label="Support Ticket Conversation">
                    <div class="admin-drawer-header">
                        <div class="admin-drawer-header-left">
                            <div class="admin-drawer-title-row">
                                <h2 class="admin-drawer-title">Ticket #${this.escapeHtml(currentTicket.ticket_number)}</h2>
                                ${this.statusBadge(currentTicket.status, (currentTicket.status || "").replace("_", " "))}
                            </div>
                            <p class="admin-drawer-subtitle">${this.escapeHtml(currentTicket.subject)} • ${this.escapeHtml(currentTicket.user_email || "")}</p>
                        </div>
                        <button type="button" class="admin-drawer-close-btn" onclick="adminApp.closeSupportTicketDrawer()" aria-label="Close drawer">&times;</button>
                    </div>
                    <div class="admin-drawer-body">
                        <div class="admin-drawer-card">
                            <div class="admin-card-header">
                                <span class="admin-card-title">TICKET STATUS</span>
                            </div>
                            <div class="admin-card-body">
                                <div class="admin-inline-actions">
                                    <button type="button" class="admin-button-secondary admin-btn-sm" onclick="adminApp.changeSupportTicketStatus('${this.escapeAttribute(currentTicket.ticket_number)}', 'open')" ${disabled}>Open</button>
                                    <button type="button" class="admin-button-secondary admin-btn-sm" onclick="adminApp.changeSupportTicketStatus('${this.escapeAttribute(currentTicket.ticket_number)}', 'in_progress')" ${disabled}>In Progress</button>
                                    <button type="button" class="admin-button-secondary admin-btn-sm admin-btn-subtle-success" onclick="adminApp.changeSupportTicketStatus('${this.escapeAttribute(currentTicket.ticket_number)}', 'resolved')" ${disabled}>Resolved</button>
                                    <button type="button" class="admin-button-secondary admin-btn-sm" onclick="adminApp.changeSupportTicketStatus('${this.escapeAttribute(currentTicket.ticket_number)}', 'closed')" ${disabled}>Close</button>
                                </div>
                            </div>
                        </div>

                        <div class="admin-drawer-card">
                            <div class="admin-card-header">
                                <span class="admin-card-title">CONVERSATION HISTORY</span>
                            </div>
                            <div class="admin-card-body admin-support-thread">
                                ${messagesHtml}
                            </div>
                        </div>

                        <div class="admin-drawer-card">
                            <div class="admin-card-header">
                                <span class="admin-card-title">SEND STAFF REPLY</span>
                            </div>
                            <div class="admin-card-body">
                                <form onsubmit="adminApp.replySupportTicket(event, '${this.escapeAttribute(currentTicket.ticket_number)}')" style="display: flex; flex-direction: column; gap: 0.75rem;">
                                    <textarea name="message" rows="4" required placeholder="Write a helpful response to the buyer..." style="width: 100%; padding: 0.65rem; border: 1px solid var(--admin-line); border-radius: var(--radius-md); font-family: inherit;"></textarea>
                                    <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                                        <button type="submit" class="admin-button-primary" ${disabled}>Send Reply</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </aside>
            `;
        }

        return `
            <section class="admin-section" aria-labelledby="admin-support-title">
                <div class="admin-section-header">
                    <div>
                        <h2 id="admin-support-title">Buyer Support Tickets</h2>
                        <p class="admin-muted">Respond to buyer inquiries, order issues, and account assistance requests.</p>
                    </div>
                    <div class="admin-pill-filter-group">
                        ${statusTabs}
                    </div>
                </div>

                <div class="admin-panel">
                    <div class="admin-panel-header">
                        <h3>${tickets.length} Support Ticket${tickets.length === 1 ? "" : "s"}</h3>
                        <button type="button" class="admin-text-button" onclick="adminApp.refreshSupportTickets()">Refresh</button>
                    </div>
                    <div class="admin-table-wrap">
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th scope="col">Ticket #</th>
                                    <th scope="col">Subject &amp; Category</th>
                                    <th scope="col">Buyer</th>
                                    <th scope="col">Status</th>
                                    <th scope="col">Updated</th>
                                    <th scope="col" style="text-align: right;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows}
                            </tbody>
                        </table>
                    </div>
                </div>
                ${ticketDrawer}
            </section>
        `;
    }

    window.SecondMarketAdminPages = window.SecondMarketAdminPages || {};
    window.SecondMarketAdminPages.renderSupportPage = renderSupportPage;
})();
