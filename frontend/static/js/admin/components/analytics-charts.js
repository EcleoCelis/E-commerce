(function (global) {
    "use strict";

    function esc(value) {
        if (value === null || value === undefined) return "";
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatCompactMoney(cents) {
        var amount = Number(cents || 0) / 100;
        if (amount >= 1000000) return "\u20B1" + (amount / 1000000).toFixed(1) + "M";
        if (amount >= 1000) return "\u20B1" + (amount / 1000).toFixed(amount >= 10000 ? 0 : 1) + "k";
        return "\u20B1" + Math.round(amount).toLocaleString("en-PH");
    }

    function computeNiceMoneyMax(rawMax) {
        if (!rawMax || rawMax <= 0) return 10000;
        var magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
        var residual = rawMax / magnitude;
        var nice = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
        return Math.max(400, nice * magnitude);
    }

    function computeIntegerAxis(rawMax) {
        var max = Math.max(1, Math.ceil(Number(rawMax || 0)));
        if (max <= 2) return { axisMax: 2, ticks: [0, 1, 2] };
        if (max === 3) return { axisMax: 3, ticks: [0, 1, 2, 3] };
        if (max <= 5) return { axisMax: max, ticks: Array.from({ length: max + 1 }, function (_, i) { return i; }) };
        var step = Math.ceil(max / 4);
        var axisMax = step * 4;
        return { axisMax: axisMax, ticks: [0, step, step * 2, step * 3, axisMax] };
    }

    function renderEmptyState(title, message, variant) {
        var toneClass = variant === "info" ? " is-info-state" : "";
        return (
            '<div class="analytics-empty-state' + toneClass + '" role="status">' +
                '<div class="analytics-empty-icon" aria-hidden="true">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">' +
                        '<path d="M3 3v18h18"></path>' +
                        '<path d="M7 15l4-4 4 3 5-6"></path>' +
                    '</svg>' +
                '</div>' +
                '<div class="analytics-empty-title">' + esc(title || "No data for this period") + '</div>' +
                '<p class="analytics-empty-copy">' + esc(message || "Try adjusting your reporting range or check back once transactions occur.") + '</p>' +
            '</div>'
        );
    }

    function buildTooltipAttr(title, rows) {
        return ' data-chart-tooltip="' + esc(JSON.stringify({ title: title || "", rows: rows || [] })) + '"';
    }

    function pickSparseLabelIndices(count, maxLabels) {
        var set = {};
        if (count <= 0) return set;
        if (count <= maxLabels) {
            for (var k = 0; k < count; k++) set[k] = true;
            return set;
        }
        var stride = Math.ceil((count - 1) / (maxLabels - 1));
        for (var i = 0; i < count; i += stride) {
            if ((count - 1 - i) >= stride * 0.55) set[i] = true;
        }
        set[0] = true;
        set[count - 1] = true;
        return set;
    }

    function renderAreaLineChart(opts) {
        var series = Array.isArray(opts.series) ? opts.series : [];
        var mode = opts.mode === "orders" ? "orders" : "revenue";
        var formatMoney = opts.formatMoney || function (c) {
            return "\u20B1" + (Number(c || 0) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        if (!series.length) {
            return renderEmptyState("No trend records in period", opts.emptyMessage || "No orders were recorded during the selected date window.");
        }

        var values = series.map(function (pt) {
            return mode === "orders"
                ? Number(pt.orders_count || 0)
                : Number((pt.net_revenue && pt.net_revenue.amount_cents) || 0);
        });
        var hasNonZero = values.some(function (v) { return v > 0; });

        if (!hasNonZero) {
            var totalOrdersInSeries = series.reduce(function (acc, pt) { return acc + Number(pt.orders_count || 0); }, 0);
            if (mode === "revenue" && totalOrdersInSeries > 0 && Number(opts.pendingCollectionCents || 0) > 0) {
                return renderEmptyState(
                    "\u20B10.00 net collected revenue in this period",
                    totalOrdersInSeries + " order" + (totalOrdersInSeries === 1 ? "" : "s") +
                    " totaling " + formatMoney(opts.pendingCollectionCents) + " " +
                    (totalOrdersInSeries === 1 ? "is" : "are") + " awaiting payment collection (e.g. Cash on Delivery). Switch to Orders Placed to inspect order dates.",
                    "info"
                );
            }
            return renderEmptyState(
                mode === "orders" ? "No orders placed in this period" : "\u20B10.00 collected revenue in this period",
                opts.emptyMessage || "Recorded transactions for this date window will populate the chart."
            );
        }

        var width = 880;
        var height = 205;
        var padLeft = mode === "orders" ? 42 : 64;
        var padRight = 24;
        var padTop = 16;
        var padBottom = 32;
        var plotW = width - padLeft - padRight;
        var plotH = height - padTop - padBottom;

        var rawMax = Math.max.apply(null, values);
        var yTicks = [];
        var axisMax;

        if (mode === "orders") {
            var intAxis = computeIntegerAxis(rawMax);
            axisMax = intAxis.axisMax;
            yTicks = intAxis.ticks;
        } else {
            axisMax = computeNiceMoneyMax(rawMax);
            for (var s = 0; s <= 4; s++) yTicks.push((axisMax / 4) * s);
        }

        var gridHtml = "";
        yTicks.forEach(function (tickVal) {
            var ratio = axisMax > 0 ? (tickVal / axisMax) : 0;
            var tickY = (padTop + plotH - ratio * plotH).toFixed(1);
            var label = mode === "orders" ? String(Math.round(tickVal)) : formatCompactMoney(tickVal);
            gridHtml += '<line x1="' + padLeft + '" y1="' + tickY + '" x2="' + (width - padRight) + '" y2="' + tickY + '" class="analytics-grid-line" />';
            gridHtml += '<text x="' + (padLeft - 10) + '" y="' + (Number(tickY) + 4) + '" text-anchor="end" class="analytics-axis-label">' + esc(label) + '</text>';
        });

        var labelIdxMap = pickSparseLabelIndices(series.length, 7);
        var xLabelHtml = "";
        var contentHtml = "";

        if (mode === "orders") {
            // Discrete daily/weekly order counts rendered cleanly as columns
            var slotW = plotW / series.length;
            var colW = Math.max(8, Math.min(34, slotW * 0.62));
            series.forEach(function (pt, idx) {
                var val = values[idx];
                var centerX = padLeft + idx * slotW + slotW / 2;
                var barH = val > 0 ? Math.max(4, (val / axisMax) * plotH) : 0;
                var y = padTop + plotH - barH;
                var netCents = (pt.net_revenue && pt.net_revenue.amount_cents) || 0;
                var attr = buildTooltipAttr(pt.label + " (" + pt.date + ")", [
                    { label: "Orders Placed", value: String(val) },
                    { label: "Paid Orders", value: String(pt.paid_orders_count || 0) },
                    { label: "Net Revenue", value: formatMoney(netCents) }
                ]);

                if (val > 0) {
                    contentHtml += (
                        '<rect x="' + (centerX - colW / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + colW.toFixed(1) + '" height="' + barH.toFixed(1) + '" ' +
                        'rx="4" fill="#2563eb" class="analytics-vbar-rect" tabindex="0" role="button" aria-label="' + esc(pt.label + ": " + val + " orders") + '"' + attr + ' />'
                    );
                } else {
                    contentHtml += (
                        '<rect x="' + (centerX - slotW / 2).toFixed(1) + '" y="' + padTop + '" width="' + slotW.toFixed(1) + '" height="' + plotH + '" ' +
                        'fill="transparent" class="analytics-zero-hit"' + attr + ' />'
                    );
                }
                if (labelIdxMap[idx]) {
                    xLabelHtml += '<text x="' + centerX.toFixed(1) + '" y="' + (height - 9) + '" text-anchor="middle" class="analytics-axis-label">' + esc(pt.label) + '</text>';
                }
            });
        } else {
            // Net collected monetary trend rendered as line + subtle area
            var strokeColor = "#059669";
            var gradId = "areaGrad_" + Math.random().toString(36).slice(2, 7);
            var coords = series.map(function (pt, idx) {
                var val = values[idx];
                var x = series.length === 1
                    ? padLeft + plotW / 2
                    : padLeft + (idx / (series.length - 1)) * plotW;
                var y = padTop + plotH - (val / axisMax) * plotH;
                return { x: x, y: y, val: val, pt: pt };
            });

            coords.forEach(function (c, idx) {
                if (labelIdxMap[idx]) {
                    xLabelHtml += '<text x="' + c.x.toFixed(1) + '" y="' + (height - 9) + '" text-anchor="middle" class="analytics-axis-label">' + esc(c.pt.label) + '</text>';
                }
            });

            if (coords.length === 1) {
                var sole = coords[0];
                var soleW = 42;
                contentHtml += '<rect x="' + (sole.x - soleW / 2).toFixed(1) + '" y="' + sole.y.toFixed(1) + '" width="' + soleW + '" height="' + (padTop + plotH - sole.y).toFixed(1) + '" rx="6" fill="' + strokeColor + '" fill-opacity="0.22" stroke="' + strokeColor + '" stroke-width="2" />';
            } else {
                var lineD = coords.map(function (c, idx) {
                    return (idx === 0 ? "M " : "L ") + c.x.toFixed(1) + " " + c.y.toFixed(1);
                }).join(" ");
                var baseLineY = (padTop + plotH).toFixed(1);
                var areaD = lineD + " L " + coords[coords.length - 1].x.toFixed(1) + " " + baseLineY + " L " + coords[0].x.toFixed(1) + " " + baseLineY + " Z";
                contentHtml += '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + strokeColor + '" stop-opacity="0.24" /><stop offset="100%" stop-color="' + strokeColor + '" stop-opacity="0.02" /></linearGradient></defs>';
                contentHtml += '<path d="' + areaD + '" fill="url(#' + gradId + ')" class="analytics-area-fill" />';
                contentHtml += '<path d="' + lineD + '" fill="none" stroke="' + strokeColor + '" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" class="analytics-line-path" />';
            }

            var bandWidth = coords.length > 1 ? Math.max(12, Math.min(44, plotW / coords.length)) : 70;
            coords.forEach(function (c) {
                var netCents = (c.pt.net_revenue && c.pt.net_revenue.amount_cents) || 0;
                var grossCents = (c.pt.gross_revenue && c.pt.gross_revenue.amount_cents) || 0;
                var refundCents = (c.pt.refunded_amount && c.pt.refunded_amount.amount_cents) || 0;
                var rows = [
                    { label: "Net Collected", value: formatMoney(netCents) },
                    { label: "Gross Paid", value: formatMoney(grossCents) },
                    { label: "Orders", value: String(c.pt.orders_count || 0) + " (" + String(c.pt.paid_orders_count || 0) + " paid)" }
                ];
                if (refundCents > 0) rows.push({ label: "Refunded", value: "-" + formatMoney(refundCents) });
                var attr = buildTooltipAttr(c.pt.label + " (" + c.pt.date + ")", rows);
                contentHtml += (
                    '<g class="analytics-point-group" tabindex="0" role="button" aria-label="' + esc(c.pt.label + ": " + formatMoney(netCents)) + '"' + attr + '>' +
                        '<line x1="' + c.x.toFixed(1) + '" y1="' + padTop + '" x2="' + c.x.toFixed(1) + '" y2="' + (padTop + plotH) + '" class="analytics-hover-guide" />' +
                        '<rect x="' + (c.x - bandWidth / 2).toFixed(1) + '" y="' + padTop + '" width="' + bandWidth.toFixed(1) + '" height="' + plotH + '" fill="transparent" />' +
                        '<circle cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="' + (coords.length > 35 ? "3" : "4") + '" fill="' + strokeColor + '" class="analytics-point-dot" />' +
                    '</g>'
                );
            });
        }

        return (
            '<div class="analytics-svg-wrap">' +
                '<svg viewBox="0 0 ' + width + ' ' + height + '" class="analytics-svg-chart analytics-svg-trend" role="img" aria-label="' + esc(mode === "orders" ? "Orders placed column chart" : "Net collected revenue chart") + '">' +
                    gridHtml +
                    xLabelHtml +
                    contentHtml +
                '</svg>' +
            '</div>'
        );
    }

    function renderDonutChart(opts) {
        var segments = (Array.isArray(opts.segments) ? opts.segments : []).filter(function (s) {
            return Number(s.value || 0) > 0;
        });
        var total = segments.reduce(function (acc, s) { return acc + Number(s.value || 0); }, 0);

        if (!total || !segments.length) {
            return renderEmptyState("No orders in period", opts.emptyMessage || "No matching records in this reporting period.");
        }

        var size = 184;
        var cx = size / 2;
        var cy = size / 2;
        var radius = 64;
        var strokeW = 22;
        var circumference = 2 * Math.PI * radius;
        var cumulative = 0;

        var arcsHtml = "";
        var legendHtml = "";

        segments.forEach(function (seg) {
            var val = Number(seg.value || 0);
            var pct = (val / total) * 100;
            var segLen = (val / total) * circumference;
            var gap = segments.length > 1 ? Math.min(2.5, segLen * 0.2) : 0;
            var dash = Math.max(0.5, segLen - gap);
            var offset = -cumulative;
            cumulative += segLen;

            var unitWord = val === 1 ? "order" : "orders";
            var countLabel = seg.displayValue || (val + " " + unitWord);
            var attr = buildTooltipAttr(seg.label, seg.tooltipRows || [
                { label: seg.metricLabel || "Orders", value: countLabel },
                { label: "Share of Total", value: pct.toFixed(1) + "%" }
            ]);

            arcsHtml += (
                '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="' + esc(seg.color) + '" ' +
                'stroke-width="' + strokeW + '" stroke-dasharray="' + dash.toFixed(2) + ' ' + circumference.toFixed(2) + '" ' +
                'stroke-dashoffset="' + offset.toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')" ' +
                'class="analytics-donut-arc" tabindex="0" role="button" aria-label="' + esc(seg.label + ": " + countLabel + " (" + pct.toFixed(1) + "%)") + '"' + attr + ' />'
            );

            legendHtml += (
                '<div class="analytics-donut-legend-row" tabindex="0"' + attr + '>' +
                    '<div class="analytics-donut-legend-top">' +
                        '<span class="analytics-legend-label">' +
                            '<span class="analytics-legend-dot" style="background:' + esc(seg.color) + '"></span>' +
                            esc(seg.label) +
                        '</span>' +
                        '<span class="analytics-legend-val">' + esc(countLabel) + ' <small>(' + pct.toFixed(1) + '%)</small></span>' +
                    '</div>' +
                    '<div class="analytics-mini-track" aria-hidden="true">' +
                        '<div class="analytics-mini-fill" style="width:' + Math.min(100, pct).toFixed(1) + '%; background:' + esc(seg.color) + '"></div>' +
                    '</div>' +
                '</div>'
            );
        });

        var centerValue = opts.centerValue !== undefined ? String(opts.centerValue) : String(total);
        var centerLabel = opts.centerLabel || "Total Orders";

        return (
            '<div class="analytics-donut-layout">' +
                '<div class="analytics-donut-ring">' +
                    '<svg viewBox="0 0 ' + size + ' ' + size + '" class="analytics-donut-svg" role="img" aria-label="' + esc(centerLabel + ": " + centerValue) + '">' +
                        '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" class="analytics-donut-track" stroke-width="' + strokeW + '" />' +
                        arcsHtml +
                    '</svg>' +
                    '<div class="analytics-donut-center">' +
                        '<div class="analytics-donut-total">' + esc(centerValue) + '</div>' +
                        '<div class="analytics-donut-caption">' + esc(centerLabel) + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="analytics-donut-legend">' + legendHtml + '</div>' +
            '</div>'
        );
    }

    function renderPieChart(opts) {
        var segments = (Array.isArray(opts.segments) ? opts.segments : []).filter(function (s) {
            return Number(s.value || 0) > 0;
        });
        var total = segments.reduce(function (acc, s) { return acc + Number(s.value || 0); }, 0);

        if (!total || !segments.length) {
            return renderEmptyState(opts.emptyTitle || "No breakdown recorded", opts.emptyMessage || "No matching records in this reporting period.");
        }

        var size = 184;
        var cx = size / 2;
        var cy = size / 2;
        var radius = 78;
        var startAngle = -Math.PI / 2;

        var slicesHtml = "";
        var legendHtml = "";

        segments.forEach(function (seg) {
            var val = Number(seg.value || 0);
            var share = val / total;
            var pct = share * 100;
            var angle = share * 2 * Math.PI;
            var endAngle = startAngle + angle;

            var tooltipRows = (seg.tooltipRows || [
                { label: seg.metricLabel || "Value", value: seg.displayValue || String(val) }
            ]).concat([{ label: "Category Share", value: pct.toFixed(1) + "%" }]);

            var attr = buildTooltipAttr(seg.label, tooltipRows);
            var ariaLabel = esc(seg.label + ": " + (seg.displayValue || val) + " (" + pct.toFixed(1) + "%)");

            if (segments.length === 1 || share >= 0.9999) {
                slicesHtml += (
                    '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="' + esc(seg.color) + '" ' +
                    'class="analytics-pie-slice" tabindex="0" role="button" aria-label="' + ariaLabel + '"' + attr + ' />'
                );
            } else {
                var x1 = cx + radius * Math.cos(startAngle);
                var y1 = cy + radius * Math.sin(startAngle);
                var x2 = cx + radius * Math.cos(endAngle);
                var y2 = cy + radius * Math.sin(endAngle);
                var largeArc = angle > Math.PI ? 1 : 0;
                var d = [
                    "M", cx.toFixed(2), cy.toFixed(2),
                    "L", x1.toFixed(2), y1.toFixed(2),
                    "A", radius, radius, 0, largeArc, 1, x2.toFixed(2), y2.toFixed(2),
                    "Z"
                ].join(" ");
                slicesHtml += (
                    '<path d="' + d + '" fill="' + esc(seg.color) + '" ' +
                    'class="analytics-pie-slice" tabindex="0" role="button" aria-label="' + ariaLabel + '"' + attr + ' />'
                );
            }
            startAngle = endAngle;

            legendHtml += (
                '<div class="analytics-donut-legend-row" tabindex="0"' + attr + '>' +
                    '<div class="analytics-donut-legend-top">' +
                        '<span class="analytics-legend-label">' +
                            '<span class="analytics-legend-dot" style="background:' + esc(seg.color) + '"></span>' +
                            esc(seg.label) +
                        '</span>' +
                        '<span class="analytics-legend-val">' + esc(seg.displayValue || String(val)) + ' <small>(' + pct.toFixed(1) + '%)</small></span>' +
                    '</div>' +
                    (seg.secondaryText ? '<div class="analytics-pie-sub">' + esc(seg.secondaryText) + '</div>' : '') +
                    '<div class="analytics-mini-track" aria-hidden="true">' +
                        '<div class="analytics-mini-fill" style="width:' + Math.min(100, pct).toFixed(1) + '%; background:' + esc(seg.color) + '"></div>' +
                    '</div>' +
                '</div>'
            );
        });

        return (
            '<div class="analytics-donut-layout">' +
                '<div class="analytics-donut-ring analytics-pie-ring">' +
                    '<svg viewBox="0 0 ' + size + ' ' + size + '" class="analytics-pie-svg" role="img" aria-label="' + esc(opts.ariaLabel || "Category share pie chart") + '">' +
                        slicesHtml +
                    '</svg>' +
                '</div>' +
                '<div class="analytics-donut-legend">' + legendHtml + '</div>' +
            '</div>'
        );
    }

    function renderPaymentBreakdown(opts) {
        var methods = Array.isArray(opts.methods) ? opts.methods : [];
        var formatMoney = opts.formatMoney || function (c) {
            return "\u20B1" + (Number(c || 0) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        if (!methods.length) {
            return renderEmptyState("No payment records in period", opts.emptyMessage || "Payment method selections and collections will appear once orders are placed.");
        }

        var totalCollected = methods.reduce(function (a, m) { return a + Number((m.collected_amount && m.collected_amount.amount_cents) || 0); }, 0);
        var totalPending = methods.reduce(function (a, m) { return a + Number((m.pending_amount && m.pending_amount.amount_cents) || 0); }, 0);
        var totalRefunded = methods.reduce(function (a, m) { return a + Number((m.refunded_amount && m.refunded_amount.amount_cents) || 0); }, 0);
        var totalFailedCount = methods.reduce(function (a, m) { return a + Number(m.failed_count || 0); }, 0);

        var summaryStrip = (
            '<div class="analytics-pay-summary">' +
                '<div class="analytics-pay-tile is-collected">' +
                    '<span class="analytics-pay-dot is-collected" aria-hidden="true"></span>' +
                    '<div><span>Collected</span><strong>' + esc(formatMoney(totalCollected)) + '</strong></div>' +
                '</div>' +
                '<div class="analytics-pay-tile is-pending">' +
                    '<span class="analytics-pay-dot is-pending" aria-hidden="true"></span>' +
                    '<div><span>Pending Settlement</span><strong>' + esc(formatMoney(totalPending)) + '</strong></div>' +
                '</div>' +
                '<div class="analytics-pay-tile is-issue">' +
                    '<span class="analytics-pay-dot is-issue" aria-hidden="true"></span>' +
                    '<div><span>Refunded / Failed</span><strong>' + esc(formatMoney(totalRefunded)) + (totalFailedCount > 0 ? ' <small>(' + totalFailedCount + ' failed)</small>' : '') + '</strong></div>' +
                '</div>' +
            '</div>'
        );

        var rowsHtml = '<div class="analytics-pay-methods" role="list">';
        methods.forEach(function (m) {
            var collected = Number((m.collected_amount && m.collected_amount.amount_cents) || 0);
            var pending = Number((m.pending_amount && m.pending_amount.amount_cents) || 0);
            var refunded = Number((m.refunded_amount && m.refunded_amount.amount_cents) || 0);
            var volume = collected + pending + refunded;

            var colPct = volume > 0 ? (collected / volume) * 100 : 0;
            var penPct = volume > 0 ? (pending / volume) * 100 : 0;
            var refPct = volume > 0 ? (refunded / volume) * 100 : 0;

            var orderWord = Number(m.orders_count || 0) === 1 ? "order" : "orders";
            var statusParts = [String(m.orders_count || 0) + " " + orderWord];
            if (m.paid_count > 0) statusParts.push(m.paid_count + " paid");
            if (m.pending_count > 0) statusParts.push(m.pending_count + " pending");
            if (m.failed_count > 0) statusParts.push(m.failed_count + " failed");

            var attr = buildTooltipAttr(m.label, [
                { label: "Collected (Paid)", value: formatMoney(collected) },
                { label: "Pending Collection", value: formatMoney(pending) },
                { label: "Refunded", value: formatMoney(refunded) },
                { label: "Breakdown", value: statusParts.join(" · ") }
            ]);

            rowsHtml += (
                '<div class="analytics-pay-row" role="listitem" tabindex="0"' + attr + '>' +
                    '<div class="analytics-pay-row-head">' +
                        '<div class="analytics-pay-name-group">' +
                            '<span class="analytics-pay-name">' + esc(m.label) + '</span>' +
                            '<span class="analytics-pay-meta">' + esc(statusParts.join(" · ")) + '</span>' +
                        '</div>' +
                        '<div class="analytics-pay-amount-group">' +
                            '<strong class="' + (collected > 0 ? "is-collected-val" : "is-zero-val") + '">' + esc(formatMoney(collected)) + ' collected</strong>' +
                            (pending > 0 ? '<span>' + esc(formatMoney(pending)) + ' pending</span>' : '') +
                        '</div>' +
                    '</div>' +
                    '<div class="analytics-stacked-track" aria-hidden="true">' +
                        (colPct > 0 ? '<div class="analytics-stack-seg is-collected" style="width:' + colPct.toFixed(1) + '%"></div>' : '') +
                        (penPct > 0 ? '<div class="analytics-stack-seg is-pending" style="width:' + penPct.toFixed(1) + '%"></div>' : '') +
                        (refPct > 0 ? '<div class="analytics-stack-seg is-issue" style="width:' + refPct.toFixed(1) + '%"></div>' : '') +
                    '</div>' +
                '</div>'
            );
        });
        rowsHtml += '</div>';

        return summaryStrip + rowsHtml;
    }

    function renderHorizontalBarList(opts) {
        var items = Array.isArray(opts.items) ? opts.items : [];
        if (!items.length) {
            return renderEmptyState("No ordered items in period", opts.emptyMessage || "No items recorded in this reporting window.");
        }

        var maxVal = Math.max.apply(null, items.map(function (it) { return Number(it.value || 0); }).concat([1]));
        var accent = opts.accentColor || "#2563eb";

        var html = '<div class="analytics-hbar-list" role="list">';
        items.forEach(function (item, idx) {
            var val = Number(item.value || 0);
            var pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
            var barColor = item.color || accent;
            var attr = buildTooltipAttr(item.label, item.tooltipRows || [
                { label: opts.metricLabel || "Value", value: item.displayValue || String(val) }
            ]);

            html += (
                '<div class="analytics-hbar-item" role="listitem" tabindex="0"' + attr + '>' +
                    '<div class="analytics-hbar-head">' +
                        '<div class="analytics-hbar-title">' +
                            '<span class="analytics-hbar-rank">' + (idx + 1) + '</span>' +
                            '<span class="analytics-hbar-name" title="' + esc(item.label) + '">' + esc(item.label) + '</span>' +
                        '</div>' +
                        '<div class="analytics-hbar-values">' +
                            '<span class="analytics-hbar-primary">' + esc(item.displayValue || String(val)) + '</span>' +
                            (item.secondaryText ? '<span class="analytics-hbar-secondary">' + esc(item.secondaryText) + '</span>' : '') +
                        '</div>' +
                    '</div>' +
                    '<div class="analytics-hbar-track" aria-hidden="true">' +
                        '<div class="analytics-hbar-fill" style="width:' + Math.max(pct > 0 ? 4 : 0, Math.min(100, pct)).toFixed(1) + '%; background:' + esc(barColor) + '"></div>' +
                    '</div>' +
                '</div>'
            );
        });
        html += '</div>';
        return html;
    }

    function renderVerticalBarChart(opts) {
        var series = Array.isArray(opts.series) ? opts.series : [];
        var valueKey = opts.valueKey || "value";
        var labelKey = opts.labelKey || "label";
        var accent = opts.accentColor || "#0891b2";

        if (!series.length) {
            return renderEmptyState("No signups recorded", opts.emptyMessage || "New customer registrations will appear here.");
        }

        var values = series.map(function (s) { return Number(s[valueKey] || 0); });
        var rawMax = Math.max.apply(null, values);
        if (rawMax <= 0) {
            return renderEmptyState("No new buyer signups in this period", opts.emptyMessage || "Registered buyer accounts created in this window will appear here.");
        }

        var width = 560;
        var height = 148;
        var padLeft = 34;
        var padRight = 14;
        var padTop = 12;
        var padBottom = 28;
        var plotW = width - padLeft - padRight;
        var plotH = height - padTop - padBottom;
        var intAxis = computeIntegerAxis(rawMax);
        var axisMax = intAxis.axisMax;

        var gridHtml = "";
        intAxis.ticks.forEach(function (tickVal) {
            var tickY = (padTop + plotH - (tickVal / axisMax) * plotH).toFixed(1);
            gridHtml += '<line x1="' + padLeft + '" y1="' + tickY + '" x2="' + (width - padRight) + '" y2="' + tickY + '" class="analytics-grid-line" />';
            gridHtml += '<text x="' + (padLeft - 8) + '" y="' + (Number(tickY) + 4) + '" text-anchor="end" class="analytics-axis-label">' + tickVal + '</text>';
        });

        var slotW = plotW / series.length;
        var barW = Math.max(6, Math.min(26, slotW * 0.6));
        var labelIdxMap = pickSparseLabelIndices(series.length, 6);
        var barsHtml = "";
        var xLabelsHtml = "";

        series.forEach(function (pt, idx) {
            var val = values[idx];
            var barH = val > 0 ? Math.max(4, (val / axisMax) * plotH) : 0;
            var x = padLeft + idx * slotW + (slotW - barW) / 2;
            var y = padTop + plotH - barH;
            var attr = buildTooltipAttr((pt[labelKey] || pt.date) + " (" + (pt.date || "") + ")", [
                { label: opts.seriesLabel || "New Signups", value: String(val) }
            ]);
            if (val > 0) {
                barsHtml += (
                    '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH.toFixed(1) + '" ' +
                    'rx="4" fill="' + esc(accent) + '" class="analytics-vbar-rect" tabindex="0" role="button" aria-label="' + esc((pt[labelKey] || pt.date) + ": " + val) + '"' + attr + ' />'
                );
            }
            if (labelIdxMap[idx]) {
                xLabelsHtml += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (height - 7) + '" text-anchor="middle" class="analytics-axis-label">' + esc(pt[labelKey] || pt.date) + '</text>';
            }
        });

        return (
            '<div class="analytics-svg-wrap">' +
                '<svg viewBox="0 0 ' + width + ' ' + height + '" class="analytics-svg-chart analytics-svg-compact" role="img" aria-label="' + esc(opts.seriesLabel || "Customer registrations chart") + '">' +
                    gridHtml +
                    xLabelsHtml +
                    barsHtml +
                '</svg>' +
            '</div>'
        );
    }

    var _tooltipEl = null;
    var _tooltipsBound = false;

    function getTooltipEl() {
        if (!_tooltipEl) {
            _tooltipEl = document.getElementById("admin-chart-tooltip");
            if (!_tooltipEl) {
                _tooltipEl = document.createElement("div");
                _tooltipEl.id = "admin-chart-tooltip";
                _tooltipEl.className = "analytics-tooltip";
                _tooltipEl.setAttribute("role", "tooltip");
                _tooltipEl.hidden = true;
                document.body.appendChild(_tooltipEl);
            }
        }
        return _tooltipEl;
    }

    function showTooltipFor(target, pointerEvent) {
        var raw = target.getAttribute("data-chart-tooltip");
        if (!raw) return;
        var data;
        try {
            data = JSON.parse(raw);
        } catch (err) {
            return;
        }
        var el = getTooltipEl();
        var rowsHtml = (data.rows || []).map(function (r) {
            return '<div class="analytics-tooltip-row"><span>' + esc(r.label) + '</span><strong>' + esc(r.value) + '</strong></div>';
        }).join("");
        el.innerHTML = '<div class="analytics-tooltip-title">' + esc(data.title) + '</div>' + rowsHtml;
        el.hidden = false;

        var rect = el.getBoundingClientRect();
        var x, y;
        if (pointerEvent && typeof pointerEvent.clientX === "number") {
            x = pointerEvent.clientX + 14;
            y = pointerEvent.clientY - rect.height - 12;
        } else {
            var box = target.getBoundingClientRect();
            x = box.left + box.width / 2 - rect.width / 2;
            y = box.top - rect.height - 10;
        }
        if (x + rect.width > window.innerWidth - 12) x = window.innerWidth - rect.width - 12;
        if (x < 12) x = 12;
        if (y < 12) {
            y = (pointerEvent && typeof pointerEvent.clientY === "number")
                ? pointerEvent.clientY + 18
                : target.getBoundingClientRect().bottom + 10;
        }
        el.style.left = Math.round(x) + "px";
        el.style.top = Math.round(y) + "px";
    }

    function hideTooltip() {
        getTooltipEl().hidden = true;
    }

    function bindTooltips() {
        if (_tooltipsBound) return;
        _tooltipsBound = true;

        document.addEventListener("mousemove", function (e) {
            var target = e.target && e.target.closest ? e.target.closest("[data-chart-tooltip]") : null;
            if (target) showTooltipFor(target, e);
            else hideTooltip();
        });

        document.addEventListener("focusin", function (e) {
            var target = e.target && e.target.closest ? e.target.closest("[data-chart-tooltip]") : null;
            if (target) showTooltipFor(target, null);
        });

        document.addEventListener("focusout", hideTooltip);
        document.addEventListener("scroll", hideTooltip, true);
    }

    global.AdminAnalyticsCharts = {
        renderAreaLineChart: renderAreaLineChart,
        renderDonutChart: renderDonutChart,
        renderPieChart: renderPieChart,
        renderPaymentBreakdown: renderPaymentBreakdown,
        renderHorizontalBarList: renderHorizontalBarList,
        renderVerticalBarChart: renderVerticalBarChart,
        renderEmptyState: renderEmptyState,
        formatCompactMoney: formatCompactMoney,
        bindTooltips: bindTooltips
    };
})(window);
