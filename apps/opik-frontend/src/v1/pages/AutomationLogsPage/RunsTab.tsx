import React, { useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";

import useRuleRunsList, {
  OnlineEvaluationRun,
} from "@/api/automations/useRuleRunsList";
import Loader from "@/shared/Loader/Loader";
import { Button } from "@/ui/button";
import PageBodyScrollContainer from "@/v1/layout/PageBodyScrollContainer/PageBodyScrollContainer";
import PageBodyStickyContainer from "@/shared/PageBodyStickyContainer/PageBodyStickyContainer";
import PageBodyStickyTableWrapper from "@/v1/layout/PageBodyStickyTableWrapper/PageBodyStickyTableWrapper";
import DataTable from "@/shared/DataTable/DataTable";
import DataTableNoData from "@/shared/DataTableNoData/DataTableNoData";
import DataTablePagination from "@/shared/DataTablePagination/DataTablePagination";
import TooltipWrapper from "@/shared/TooltipWrapper/TooltipWrapper";
import { COLUMN_TYPE, ColumnData } from "@/types/shared";
import { convertColumnDataToColumn } from "@/lib/table";
import useLocalStorageState from "use-local-storage-state";
import TimeCell from "@/shared/DataTableCells/TimeCell";

type OnlineEvaluationRunWithId = OnlineEvaluationRun & { id: string };

const DEFAULT_SIZE = 20;

const COLUMNS: ColumnData<OnlineEvaluationRunWithId>[] = [
  {
    id: "trace_name",
    label: "Trace Name",
    type: COLUMN_TYPE.string,
    size: 180,
  },
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

  const rows: OnlineEvaluationRunWithId[] = useMemo(() => {
    return (
      data?.content.map((item, index) => ({
        ...item,
        id: `${item.trace_id}-${item.score_name}-${index}`,
      })) ?? []
    );
  }, [data?.content]);

  const columns = useMemo(() => {
    return convertColumnDataToColumn<
      OnlineEvaluationRunWithId,
      OnlineEvaluationRunWithId
    >(COLUMNS, {});
  }, []);

  const resizeConfig = useMemo(
    () => ({
      enabled: true,
      columnSizing: columnsWidth,
      onColumnResize: setColumnsWidth,
    }),
    [columnsWidth, setColumnsWidth],
  );

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="flex h-full flex-col">
      <PageBodyScrollContainer>
        <PageBodyStickyContainer
          className="flex items-center justify-between pb-4 pt-2"
          direction="bidirectional"
        >
          <div className="flex items-center gap-2">
            <TooltipWrapper content="Refresh runs list">
              <Button
                variant="outline"
                size="icon-sm"
                className="shrink-0"
                onClick={() => {
                  refetch();
                }}
              >
                <RotateCw />
              </Button>
            </TooltipWrapper>
          </div>
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
          showLoadingOverlay={isPlaceholderData && isFetching}
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
