import React, { useCallback, useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import useRuleRunsList, {
  OnlineEvaluationRun,
} from "@/api/automations/useRuleRunsList";
import PageBodyScrollContainer from "@/v2/layout/PageBodyScrollContainer/PageBodyScrollContainer";
import PageBodyStickyContainer from "@/shared/PageBodyStickyContainer/PageBodyStickyContainer";
import PageBodyStickyTableWrapper from "@/v2/layout/PageBodyStickyTableWrapper/PageBodyStickyTableWrapper";
import DataTable from "@/shared/DataTable/DataTable";
import DataTableNoData from "@/shared/DataTableNoData/DataTableNoData";
import DataTablePagination from "@/shared/DataTablePagination/DataTablePagination";
import RefreshButton from "@/shared/RefreshButton/RefreshButton";
import LinkCell from "@/shared/DataTableCells/LinkCell";
import { COLUMN_TYPE, ColumnData } from "@/types/shared";
import { convertColumnDataToColumn } from "@/lib/table";
import useLocalStorageState from "use-local-storage-state";
import TimeCell from "@/shared/DataTableCells/TimeCell";
import useAppStore, { useActiveProjectId } from "@/store/AppStore";

type OnlineEvaluationRunWithId = OnlineEvaluationRun & { id: string };

const DEFAULT_SIZE = 20;

const STATIC_COLUMNS: ColumnData<OnlineEvaluationRunWithId>[] = [
  {
    id: "input",
    label: "Input",
    type: COLUMN_TYPE.string,
    size: 250,
  },
  {
    id: "output",
    label: "Output",
    type: COLUMN_TYPE.string,
    size: 250,
  },
  {
    id: "score_name",
    label: "Score Name",
    type: COLUMN_TYPE.string,
    size: 140,
  },
  {
    id: "score_value",
    label: "Score Value",
    type: COLUMN_TYPE.number,
    size: 100,
  },
  {
    id: "score_reason",
    label: "Reason",
    type: COLUMN_TYPE.string,
    size: 200,
  },
  {
    id: "scored_at",
    label: "Scored At",
    type: COLUMN_TYPE.time,
    cell: TimeCell as never,
    customMeta: {
      timeMode: "absolute",
    },
    size: 180,
  },
];

const COLUMNS_WIDTH_KEY = "automation-runs-columns-width";

interface RunsTabProps {
  ruleId: string;
}

const RunsTab: React.FC<RunsTabProps> = ({ ruleId }) => {
  const navigate = useNavigate();
  const workspaceName = useAppStore((state) => state.activeWorkspaceName);
  const projectId = useActiveProjectId();

  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [columnsWidth, setColumnsWidth] = useLocalStorageState<
    Record<string, number>
  >(COLUMNS_WIDTH_KEY, {
    defaultValue: {},
  });

  const { data, isPending, isPlaceholderData, isFetching, refetch } =
    useRuleRunsList(
      {
        ruleId,
        page,
        size,
      },
      {
        placeholderData: keepPreviousData,
      },
    );

  const handleTraceNameClick = useCallback(
    (row: OnlineEvaluationRunWithId) => {
      if (!row.trace_id || !projectId) return;
      navigate({
        to: "/$workspaceName/projects/$projectId/logs",
        params: { workspaceName, projectId },
        search: { trace: row.trace_id },
      });
    },
    [navigate, workspaceName, projectId],
  );

  const rows: OnlineEvaluationRunWithId[] = useMemo(() => {
    return (
      data?.content.map((item, index) => ({
        ...item,
        id: `${item.trace_id}-${item.score_name}-${index}`,
      })) ?? []
    );
  }, [data?.content]);

  const columns = useMemo(() => {
    const allColumns: ColumnData<OnlineEvaluationRunWithId>[] = [
      {
        id: "trace_name",
        label: "Trace Name",
        type: COLUMN_TYPE.string,
        cell: LinkCell as never,
        customMeta: {
          callback: handleTraceNameClick,
        },
        size: 180,
      },
      ...STATIC_COLUMNS,
    ];
    return convertColumnDataToColumn<
      OnlineEvaluationRunWithId,
      OnlineEvaluationRunWithId
    >(allColumns, {});
  }, [handleTraceNameClick]);

  const resizeConfig = useMemo(
    () => ({
      enabled: true,
      columnSizing: columnsWidth,
      onColumnResize: setColumnsWidth,
    }),
    [columnsWidth, setColumnsWidth],
  );

  const isTableLoading = isPending || (isPlaceholderData && rows.length === 0);

  return (
    <div className="flex h-full flex-col">
      <PageBodyScrollContainer>
        <PageBodyStickyContainer
          className="flex items-center justify-end py-4"
          direction="bidirectional"
        >
          <RefreshButton
            tooltip="Refresh runs list"
            isFetching={isFetching}
            onRefresh={() => refetch()}
          />
        </PageBodyStickyContainer>
        <DataTable
          columns={columns}
          data={rows}
          noData={
            <DataTableNoData title="There are no evaluation runs for this rule." />
          }
          TableWrapper={PageBodyStickyTableWrapper}
          getRowId={(row) => row.id}
          stickyHeader
          resizeConfig={resizeConfig}
          showSkeleton={isTableLoading}
          showLoadingOverlay={
            !isTableLoading && isPlaceholderData && isFetching
          }
        />
        <div className="py-4">
          <DataTablePagination
            page={page}
            pageChange={setPage}
            size={size}
            sizeChange={setSize}
            total={data?.total ?? 0}
          />
        </div>
      </PageBodyScrollContainer>
    </div>
  );
};

export default RunsTab;
