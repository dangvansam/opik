import React, { useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import useLocalStorageState from "use-local-storage-state";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import useAlertEventsList from "@/api/alerts/useAlertEventsList";
import DataTable from "@/shared/DataTable/DataTable";
import DataTablePagination from "@/shared/DataTablePagination/DataTablePagination";
import DataTableNoData from "@/shared/DataTableNoData/DataTableNoData";
import Loader from "@/shared/Loader/Loader";
import TimeCell from "@/shared/DataTableCells/TimeCell";
import useAppStore from "@/store/AppStore";
import {
  DELIVERY_STATUS,
  WebhookDeliveryLog,
} from "@/types/alerts";
import { COLUMN_TYPE, ColumnData } from "@/types/shared";
import { convertColumnDataToColumn } from "@/lib/table";
import { Button } from "@/ui/button";
import { CellContext } from "@tanstack/react-table";
import { cn } from "@/lib/utils";

const PAGINATION_SIZE_KEY = "alert-events-pagination-size";

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

const DeliveryStatusCell: React.FunctionComponent<
  CellContext<WebhookDeliveryLog, unknown>
> = ({ row }) => {
  const status = row.original.status;
  const config = STATUS_CONFIG[status] || STATUS_CONFIG[DELIVERY_STATUS.PENDING];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        config.className,
      )}
    >
      {config.label}
    </span>
  );
};

const HttpStatusCell: React.FunctionComponent<
  CellContext<WebhookDeliveryLog, unknown>
> = ({ row }) => {
  const code = row.original.http_status_code;
  if (!code || code === 0) return <span className="text-muted-slate">-</span>;
  return <span>{code}</span>;
};

const ErrorMessageCell: React.FunctionComponent<
  CellContext<WebhookDeliveryLog, unknown>
> = ({ row }) => {
  const msg = row.original.error_message;
  if (!msg) return <span className="text-muted-slate">-</span>;
  return (
    <span className="truncate" title={msg}>
      {msg}
    </span>
  );
};

const DEFAULT_COLUMNS: ColumnData<WebhookDeliveryLog>[] = [
  {
    id: "status",
    label: "Status",
    type: COLUMN_TYPE.string,
    cell: DeliveryStatusCell as never,
  },
  {
    id: "event_type",
    label: "Event Type",
    type: COLUMN_TYPE.string,
  },
  {
    id: "http_status_code",
    label: "HTTP Status",
    type: COLUMN_TYPE.number,
    cell: HttpStatusCell as never,
  },
  {
    id: "retry_count",
    label: "Retries",
    type: COLUMN_TYPE.number,
    accessorFn: (row) => `${row.retry_count}/${row.max_retries}`,
  },
  {
    id: "error_message",
    label: "Error",
    type: COLUMN_TYPE.string,
    cell: ErrorMessageCell as never,
  },
  {
    id: "created_at",
    label: "Created",
    type: COLUMN_TYPE.time,
    cell: TimeCell as never,
  },
  {
    id: "completed_at",
    label: "Completed",
    type: COLUMN_TYPE.time,
    cell: TimeCell as never,
  },
];

const SELECTED_COLUMNS = [
  "status",
  "event_type",
  "http_status_code",
  "retry_count",
  "error_message",
  "created_at",
  "completed_at",
];

interface AlertEventsPageProps {
  alertId: string;
  alertName?: string;
}

const AlertEventsPage: React.FunctionComponent<AlertEventsPageProps> = ({
  alertId,
  alertName,
}) => {
  const workspaceName = useAppStore((state) => state.activeWorkspaceName);
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [size, setSize] = useLocalStorageState<number>(PAGINATION_SIZE_KEY, {
    defaultValue: 20,
  });

  const { data, isPending, isPlaceholderData, isFetching } =
    useAlertEventsList(
      { alertId, page, size },
      { placeholderData: keepPreviousData },
    );

  const events = useMemo(() => data?.content ?? [], [data?.content]);
  const total = data?.total ?? 0;

  const columns = useMemo(() => {
    return convertColumnDataToColumn<WebhookDeliveryLog, WebhookDeliveryLog>(
      DEFAULT_COLUMNS,
      {
        columnsOrder: SELECTED_COLUMNS,
        selectedColumns: SELECTED_COLUMNS,
        sortableColumns: [],
      },
    );
  }, []);

  const handleBackClick = () => {
    navigate({
      to: "/$workspaceName/alerts",
      params: { workspaceName },
    });
  };

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={handleBackClick}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="comet-title-l">
          {alertName ? `${alertName} - Events` : "Alert Events"}
        </h1>
      </div>

      <DataTable
        columns={columns}
        data={events}
        getRowId={(row) => row.webhook_event_id}
        noData={<DataTableNoData title="No delivery events yet" />}
        showLoadingOverlay={isPlaceholderData && isFetching}
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
