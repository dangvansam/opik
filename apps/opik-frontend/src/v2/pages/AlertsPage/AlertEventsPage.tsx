import React, { useCallback, useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import useLocalStorageState from "use-local-storage-state";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { CellContext, Row } from "@tanstack/react-table";

import useAlertEventsList from "@/api/alerts/useAlertEventsList";
import DataTable from "@/shared/DataTable/DataTable";
import DataTablePagination from "@/shared/DataTablePagination/DataTablePagination";
import DataTableNoData from "@/shared/DataTableNoData/DataTableNoData";
import RefreshButton from "@/shared/RefreshButton/RefreshButton";
import ColumnsButton from "@/shared/ColumnsButton/ColumnsButton";
import Loader from "@/shared/Loader/Loader";
import useAppStore, { useActiveProjectId } from "@/store/AppStore";
import { DELIVERY_STATUS, WebhookDeliveryLog } from "@/types/alerts";
import { COLUMN_TYPE, ColumnData } from "@/types/shared";
import { convertColumnDataToColumn } from "@/lib/table";
import { Button } from "@/ui/button";
import { TableCell, TableRow } from "@/ui/table";
import { cn } from "@/lib/utils";
import { Separator } from "@/ui/separator";

const PAGINATION_SIZE_KEY = "alert-events-pagination-size";
const SELECTED_COLUMNS_KEY = "alert-events-selected-columns";
const COLUMNS_ORDER_KEY = "alert-events-columns-order";
const COLUMNS_WIDTH_KEY = "alert-events-columns-width";

interface TraceInfo {
  trace_id: string;
  trace_name: string;
  input: string;
  output: string;
}

interface ParsedPayload {
  project_names: string;
  feedback_score_name: string;
  metric_value: string;
  threshold: string;
  traces: TraceInfo[];
}

const parsePayload = (raw: string): ParsedPayload | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const meta = parsed?.payload?.metadata?.[0];
    if (!meta) return null;

    const rawTraces = meta.traces || [];
    const traces: TraceInfo[] = rawTraces.map(
      (t: { trace_id: string; trace_name: string; input: unknown; output: unknown }) => ({
        trace_id: t.trace_id || "",
        trace_name: t.trace_name || "",
        input: t.input ? JSON.stringify(t.input) : "",
        output: t.output ? JSON.stringify(t.output) : "",
      }),
    );

    return {
      project_names: meta.project_names || "",
      feedback_score_name: meta.feedback_score_name || "",
      metric_value: meta.metric_value || "",
      threshold: meta.threshold || "",
      traces,
    };
  } catch {
    return null;
  }
};

const firstTraceField = (
  parsed: ParsedPayload | null | undefined,
  field: keyof TraceInfo,
): { value: string; total: number } => {
  if (!parsed || parsed.traces.length === 0)
    return { value: "", total: 0 };
  return {
    value: parsed.traces[0][field],
    total: parsed.traces.length,
  };
};

type EventRow = WebhookDeliveryLog & {
  _isPayloadRow?: boolean;
  _payloadJson?: string;
  _responseBody?: string;
  _parsed?: ParsedPayload | null;
};

const STATUS_CONFIG: Record<
  DELIVERY_STATUS,
  { label: string; className: string }
> = {
  [DELIVERY_STATUS.PENDING]: {
    label: "Pending",
    className: "bg-yellow-100 text-yellow-800",
  },
  [DELIVERY_STATUS.SUCCESS]: {
    label: "Success",
    className: "bg-green-100 text-green-800",
  },
  [DELIVERY_STATUS.FAILED]: {
    label: "Failed",
    className: "bg-red-100 text-red-800",
  },
};

const formatDateTime = (iso: string) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

const formatPayloadJson = (raw: string): string => {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

const CELL_CLASS =
  "flex size-full overflow-hidden px-3 comet-body-xs cursor-auto items-center justify-start py-3.5 !pl-3 !pr-0";

const DeliveryStatusCell: React.FunctionComponent<
  CellContext<EventRow, unknown>
> = ({ row }) => {
  const status = row.original.status;
  const config = STATUS_CONFIG[status] || STATUS_CONFIG[DELIVERY_STATUS.PENDING];

  return (
    <div className={CELL_CLASS}>
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
          config.className,
        )}
      >
        {config.label}
      </span>
    </div>
  );
};

const HttpStatusCell: React.FunctionComponent<
  CellContext<EventRow, unknown>
> = ({ row }) => {
  const code = row.original.http_status_code;
  return (
    <div className={CELL_CLASS}>
      {!code || code === 0 ? (
        <span className="text-muted-slate">-</span>
      ) : (
        <span>{code}</span>
      )}
    </div>
  );
};

const DateTimeCell: React.FunctionComponent<
  CellContext<EventRow, unknown>
> = ({ getValue }) => {
  const value = getValue() as string;
  return (
    <div className={CELL_CLASS}>
      <span className="truncate">{formatDateTime(value)}</span>
    </div>
  );
};

const ErrorMessageCell: React.FunctionComponent<
  CellContext<EventRow, unknown>
> = ({ row }) => {
  const msg = row.original.error_message;
  return (
    <div className={CELL_CLASS}>
      {!msg ? (
        <span className="text-muted-slate">-</span>
      ) : (
        <span className="truncate" title={msg}>
          {msg}
        </span>
      )}
    </div>
  );
};

const TruncatedTextCell: React.FunctionComponent<
  CellContext<EventRow, unknown>
> = ({ getValue }) => {
  const value = getValue() as string;
  return (
    <div className={CELL_CLASS}>
      {!value ? (
        <span className="text-muted-slate">-</span>
      ) : (
        <span className="truncate" title={value}>
          {value}
        </span>
      )}
    </div>
  );
};

const TraceFieldCell = (field: keyof TraceInfo): React.FunctionComponent<CellContext<EventRow, unknown>> => {
  const Component: React.FunctionComponent<CellContext<EventRow, unknown>> = ({ row }) => {
    const { value, total } = firstTraceField(row.original._parsed, field);
    if (!value) {
      return (
        <div className={CELL_CLASS}>
          <span className="text-muted-slate">-</span>
        </div>
      );
    }
    const isMono = field === "trace_id" || field === "input" || field === "output";
    const allValues = (row.original._parsed?.traces || [])
      .map((t) => t[field])
      .filter(Boolean)
      .join("\n");
    return (
      <div className={CELL_CLASS}>
        <span
          className={cn("truncate", isMono && "font-mono")}
          title={allValues}
        >
          {value}
        </span>
        {total > 1 && (
          <span className="ml-1.5 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            +{total - 1}
          </span>
        )}
      </div>
    );
  };
  return Component;
};

const ResponsePreviewCell: React.FunctionComponent<
  CellContext<EventRow, unknown>
> = ({ row }) => {
  const body = row.original.response_body;
  return (
    <div className={CELL_CLASS}>
      {!body ? (
        <span className="text-muted-slate">-</span>
      ) : (
        <span className="truncate font-mono text-green-700" title={body}>
          {body.length > 60 ? body.slice(0, 60) + "…" : body}
        </span>
      )}
    </div>
  );
};

const DEFAULT_COLUMNS: ColumnData<EventRow>[] = [
  {
    id: "event_type",
    label: "Event Type",
    type: COLUMN_TYPE.string,
    size: 150,
    minSize: 120,
  },
  {
    id: "project_names",
    label: "Project",
    type: COLUMN_TYPE.string,
    cell: TruncatedTextCell as never,
    accessorFn: (row: EventRow) => row._parsed?.project_names || "-",
    size: 160,
    minSize: 100,
  },
  {
    id: "feedback_score_name",
    label: "Score Name",
    type: COLUMN_TYPE.string,
    cell: TruncatedTextCell as never,
    accessorFn: (row: EventRow) => row._parsed?.feedback_score_name || "-",
    size: 130,
    minSize: 90,
  },
  {
    id: "metric_value",
    label: "Metric Value",
    type: COLUMN_TYPE.string,
    accessorFn: (row: EventRow) => row._parsed?.metric_value || "-",
    size: 100,
    minSize: 80,
  },
  {
    id: "threshold",
    label: "Threshold",
    type: COLUMN_TYPE.string,
    accessorFn: (row: EventRow) => row._parsed?.threshold || "-",
    size: 90,
    minSize: 70,
  },
  {
    id: "trace_ids",
    label: "Trace ID",
    type: COLUMN_TYPE.string,
    cell: TraceFieldCell("trace_id") as never,
    size: 200,
    minSize: 120,
  },
  {
    id: "trace_names",
    label: "Trace Name",
    type: COLUMN_TYPE.string,
    cell: TraceFieldCell("trace_name") as never,
    size: 160,
    minSize: 100,
  },
  {
    id: "trace_input",
    label: "Trace Input",
    type: COLUMN_TYPE.string,
    cell: TraceFieldCell("input") as never,
    size: 200,
    minSize: 120,
  },
  {
    id: "trace_output",
    label: "Trace Output",
    type: COLUMN_TYPE.string,
    cell: TraceFieldCell("output") as never,
    size: 200,
    minSize: 120,
  },
  {
    id: "http_status_code",
    label: "HTTP",
    type: COLUMN_TYPE.number,
    cell: HttpStatusCell as never,
    size: 70,
    minSize: 60,
  },
  {
    id: "response_body",
    label: "Response",
    type: COLUMN_TYPE.string,
    cell: ResponsePreviewCell as never,
    size: 220,
    minSize: 120,
  },
  {
    id: "error_message",
    label: "Error",
    type: COLUMN_TYPE.string,
    cell: ErrorMessageCell as never,
    size: 150,
    minSize: 100,
  },
  {
    id: "retry_count",
    label: "Retries",
    type: COLUMN_TYPE.number,
    accessorFn: (row: EventRow) => `${row.retry_count}/${row.max_retries}`,
    size: 70,
    minSize: 60,
  },
  {
    id: "created_at",
    label: "Created",
    type: COLUMN_TYPE.string,
    cell: DateTimeCell as never,
    size: 155,
    minSize: 140,
  },
  {
    id: "completed_at",
    label: "Completed",
    type: COLUMN_TYPE.string,
    cell: DateTimeCell as never,
    size: 155,
    minSize: 140,
  },
  {
    id: "status",
    label: "Status",
    type: COLUMN_TYPE.string,
    cell: DeliveryStatusCell as never,
    size: 90,
    minSize: 80,
  },
];

const DEFAULT_SELECTED_COLUMNS = [
  "event_type",
  "project_names",
  "feedback_score_name",
  "metric_value",
  "trace_ids",
  "trace_names",
  "trace_input",
  "trace_output",
  "http_status_code",
  "response_body",
  "created_at",
  "status",
];

const DEFAULT_COLUMNS_ORDER = [
  "event_type",
  "project_names",
  "feedback_score_name",
  "metric_value",
  "threshold",
  "trace_ids",
  "trace_names",
  "trace_input",
  "trace_output",
  "http_status_code",
  "response_body",
  "error_message",
  "retry_count",
  "created_at",
  "completed_at",
  "status",
];

interface AlertEventsPageProps {
  alertId: string;
  alertName?: string;
  onBack?: () => void;
}

const AlertEventsPage: React.FunctionComponent<AlertEventsPageProps> = ({
  alertId,
  alertName,
  onBack,
}) => {
  const workspaceName = useAppStore((state) => state.activeWorkspaceName);
  const activeProjectId = useActiveProjectId();
  const navigate = useNavigate();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const [columnsWidth, setColumnsWidth] = useLocalStorageState<
    Record<string, number>
  >(COLUMNS_WIDTH_KEY, {
    defaultValue: {},
  });

  const [selectedColumns, setSelectedColumns] = useLocalStorageState<string[]>(
    SELECTED_COLUMNS_KEY,
    { defaultValue: DEFAULT_SELECTED_COLUMNS },
  );

  const [columnsOrder, setColumnsOrder] = useLocalStorageState<string[]>(
    COLUMNS_ORDER_KEY,
    { defaultValue: DEFAULT_COLUMNS_ORDER },
  );

  const [page, setPage] = useState(1);
  const [size, setSize] = useLocalStorageState<number>(PAGINATION_SIZE_KEY, {
    defaultValue: 20,
  });

  const { data, isPending, isPlaceholderData, isFetching, refetch } =
    useAlertEventsList(
      { alertId, page, size },
      { placeholderData: keepPreviousData },
    );

  const events = useMemo(() => data?.content ?? [], [data?.content]);
  const total = data?.total ?? 0;

  const enrichedEvents: EventRow[] = useMemo(
    () =>
      events.map((e) => ({
        ...e,
        _parsed: parsePayload(e.payload_json),
      })),
    [events],
  );

  const tableData: EventRow[] = useMemo(() => {
    const rows: EventRow[] = [];
    for (const event of enrichedEvents) {
      rows.push(event);
      if (
        expandedRow === event.webhook_event_id &&
        (event.payload_json || event.response_body)
      ) {
        rows.push({
          ...event,
          _isPayloadRow: true,
          _payloadJson: event.payload_json,
          _responseBody: event.response_body,
          webhook_event_id: `${event.webhook_event_id}-payload`,
        });
      }
    }
    return rows;
  }, [enrichedEvents, expandedRow]);

  const columns = useMemo(() => {
    return convertColumnDataToColumn<EventRow, EventRow>(DEFAULT_COLUMNS, {
      columnsOrder,
      selectedColumns,
      sortableColumns: [],
    });
  }, [columnsOrder, selectedColumns]);

  const resizeConfig = useMemo(
    () => ({
      enabled: true,
      columnSizing: columnsWidth,
      onColumnResize: setColumnsWidth,
    }),
    [columnsWidth, setColumnsWidth],
  );

  const getIsCustomRow = useCallback(
    (row: Row<EventRow>) => Boolean(row.original._isPayloadRow),
    [],
  );

  const renderCustomRow = useCallback(
    (row: Row<EventRow>) => {
      const payload = row.original._payloadJson || "";
      const response = row.original._responseBody || "";
      return (
        <TableRow key={row.id} className="hover:bg-transparent">
          <TableCell colSpan={columns.length} className="bg-muted/30 p-0">
            <div className="flex divide-x">
              {payload && (
                <div className="min-w-0 flex-1">
                  <div className="border-b px-4 py-1.5 text-xs font-semibold text-muted-foreground">
                    Request Payload
                  </div>
                  <pre className="max-h-72 overflow-auto px-4 py-3 font-mono text-xs leading-relaxed">
                    {formatPayloadJson(payload)}
                  </pre>
                </div>
              )}
              {response && (
                <div className="min-w-0 flex-1">
                  <div className="border-b px-4 py-1.5 text-xs font-semibold text-green-700">
                    Webhook Response
                  </div>
                  <pre className="max-h-72 overflow-auto px-4 py-3 font-mono text-xs leading-relaxed text-green-800">
                    {formatPayloadJson(response)}
                  </pre>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      );
    },
    [columns.length],
  );

  const handleBackClick = () => {
    if (onBack) {
      onBack();
      return;
    }
    navigate({
      to: "/$workspaceName/projects/$projectId/alerts",
      params: { workspaceName, projectId: activeProjectId! },
    });
  };

  const handleRowClick = useCallback(
    (row: EventRow) => {
      if (row._isPayloadRow) return;
      if (!row.payload_json && !row.response_body) return;
      setExpandedRow(
        expandedRow === row.webhook_event_id ? null : row.webhook_event_id,
      );
    },
    [expandedRow],
  );

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="pt-2">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={handleBackClick}>
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="comet-body-accented">
            {alertName ? `${alertName} — Events` : "Alert Events"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton
            tooltip="Refresh events"
            isFetching={isFetching}
            onRefresh={() => refetch()}
          />
          <Separator orientation="vertical" className="mx-1 h-4" />
          <ColumnsButton
            columns={DEFAULT_COLUMNS}
            selectedColumns={selectedColumns}
            onSelectionChange={setSelectedColumns}
            order={columnsOrder}
            onOrderChange={setColumnsOrder}
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={tableData}
        getRowId={(row) => row.webhook_event_id}
        noData={<DataTableNoData title="No delivery events yet" />}
        showLoadingOverlay={isPlaceholderData && isFetching}
        onRowClick={handleRowClick}
        getIsCustomRow={getIsCustomRow}
        renderCustomRow={renderCustomRow}
        resizeConfig={resizeConfig}
        stickyHeader
      />
      <div className="py-4">
        <DataTablePagination
          page={page}
          pageChange={setPage}
          size={size}
          sizeChange={setSize}
          total={total}
        />
      </div>
    </div>
  );
};

export default AlertEventsPage;
