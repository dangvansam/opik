import React, { useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { flatMap, get, uniq } from "lodash";
import md5 from "md5";
import { FoldVertical, UnfoldVertical } from "lucide-react";

import useRulesLogsList from "@/api/automations/useRulesLogsList";
import NoData from "@/shared/NoData/NoData";
import { Button } from "@/ui/button";
import PageBodyScrollContainer from "@/v2/layout/PageBodyScrollContainer/PageBodyScrollContainer";
import PageBodyStickyContainer from "@/shared/PageBodyStickyContainer/PageBodyStickyContainer";
import PageBodyStickyTableWrapper from "@/v2/layout/PageBodyStickyTableWrapper/PageBodyStickyTableWrapper";
import DataTable from "@/shared/DataTable/DataTable";
import DataTableNoData from "@/shared/DataTableNoData/DataTableNoData";
import ExpandableTextCell from "@/shared/DataTableCells/ExpandableTextCell";
import RefreshButton from "@/shared/RefreshButton/RefreshButton";
import TooltipWrapper from "@/shared/TooltipWrapper/TooltipWrapper";
import { COLUMN_TYPE, ColumnData } from "@/types/shared";
import {
  EvaluatorRuleLogItem,
  EvaluatorRuleLogItemWithId,
} from "@/types/automations";
import { convertColumnDataToColumn } from "@/lib/table";
import useLocalStorageState from "use-local-storage-state";
import TimeCell from "@/shared/DataTableCells/TimeCell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import RunsTab from "@/v2/pages/AutomationLogsPage/RunsTab";

const generateEvaluatorRuleLogItemKey = (
  item: EvaluatorRuleLogItem,
): string => {
  const messageHash = md5(item.message);
  return `${item.timestamp}-${item.level}-${messageHash}`;
};

const BASE_COLUMNS: ColumnData<EvaluatorRuleLogItemWithId>[] = [
  {
    id: "timestamp",
    label: "Timestamp",
    type: COLUMN_TYPE.time,
    cell: TimeCell as never,
    customMeta: {
      timeMode: "absolute",
    },
    size: 180,
  },
  {
    id: "level",
    label: "Level",
    type: COLUMN_TYPE.string,
    size: 80,
  },
];

const COLUMNS_WIDTH_KEY = "automation-logs-columns-width";

const AutomationLogsPage = () => {
  const {
    rule_id,
    tab,
  }: {
    rule_id?: string;
    tab?: string;
  } = useSearch({ strict: false });

  const [activeTab, setActiveTab] = useState(tab || "logs");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [columnsWidth, setColumnsWidth] = useLocalStorageState<
    Record<string, number>
  >(COLUMNS_WIDTH_KEY, {
    defaultValue: {},
  });

  const { data, isPending, isPlaceholderData, isFetching, refetch } =
    useRulesLogsList(
      {
        ruleId: rule_id!,
      },
      {
        enabled: Boolean(rule_id) && activeTab === "logs",
      },
    );

  const { rows, markerKeys } = useMemo(() => {
    const rawRows =
      data?.content.sort((a, b) => b.timestamp.localeCompare(a.timestamp)) ??
      [];

    const sortedRowsWithId: EvaluatorRuleLogItemWithId[] = rawRows.map(
      (item) => ({
        ...item,
        id: generateEvaluatorRuleLogItemKey(item),
      }),
    );

    const allMarkerKeys = uniq(
      flatMap(sortedRowsWithId, (item) =>
        item.markers ? Object.keys(item.markers) : [],
      ),
    ).sort();

    return {
      rows: sortedRowsWithId,
      markerKeys: allMarkerKeys,
    };
  }, [data?.content]);

  const allExpanded = useMemo(
    () => rows.length > 0 && rows.every((row) => expanded[row.id]),
    [rows, expanded],
  );

  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpanded({});
    } else {
      setExpanded((prev) => {
        const next = { ...prev } as Record<string, boolean>;
        rows.forEach((row) => {
          next[row.id] = true;
        });
        return next;
      });
    }
  };

  const columns = useMemo(() => {
    const markerColumns: ColumnData<EvaluatorRuleLogItemWithId>[] =
      markerKeys.map((key) => ({
        id: `marker_${key}`,
        label: key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        type: COLUMN_TYPE.string,
        accessorFn: (row) => get(row, ["markers", key], ""),
      }));

    const messageColumn: ColumnData<EvaluatorRuleLogItemWithId> = {
      id: "message",
      label: "Message",
      type: COLUMN_TYPE.string,
      cell: ExpandableTextCell as never,
      size: 400,
      customMeta: {
        expandedState: expanded,
        setExpandedState: setExpanded,
        getShortValue: (value: string) => (value || "").split("\n")[0] || "",
        getIsExpandable: (value: string) =>
          (value || "").split("\n").length > 1,
      },
    };

    const allColumns = [...BASE_COLUMNS, ...markerColumns, messageColumn];
    return convertColumnDataToColumn<
      EvaluatorRuleLogItemWithId,
      EvaluatorRuleLogItemWithId
    >(allColumns, {});
  }, [markerKeys, expanded, setExpanded]);

  const resizeConfig = useMemo(
    () => ({
      enabled: true,
      columnSizing: columnsWidth,
      onColumnResize: setColumnsWidth,
    }),
    [columnsWidth, setColumnsWidth],
  );

  if (!rule_id) {
    return <NoData message="No rule parameters set."></NoData>;
  }

  const isTableLoading =
    activeTab === "logs" &&
    (isPending || (isPlaceholderData && rows.length === 0));

  return (
    <div className="mx-6 flex h-full flex-col bg-soft-background">
      <PageBodyStickyContainer
        className="flex items-center justify-between pb-2 pt-4"
        direction="bidirectional"
      >
        <h1 className="comet-title-xs truncate break-words">
          Automation Rule Details
        </h1>
      </PageBodyStickyContainer>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="underline">
          <TabsTrigger variant="underline" value="logs">
            Logs
          </TabsTrigger>
          <TabsTrigger variant="underline" value="runs">
            Runs
          </TabsTrigger>
        </TabsList>
        <TabsContent value="logs">
          {isTableLoading ? (
            <div className="flex h-full items-center justify-center py-20">
              <div className="text-muted-foreground">Loading...</div>
            </div>
          ) : rows.length === 0 && activeTab === "logs" ? (
            <NoData message="There are no logs for this rule."></NoData>
          ) : (
            <div className="flex h-full flex-col">
              <PageBodyScrollContainer>
                <PageBodyStickyContainer
                  className="flex items-center justify-end py-4"
                  direction="bidirectional"
                >
                  <div className="flex items-center gap-2">
                    <RefreshButton
                      tooltip="Refresh logs list"
                      isFetching={isFetching}
                      onRefresh={() => refetch()}
                    />
                    <TooltipWrapper
                      content={allExpanded ? "Collapse all" : "Expand all"}
                    >
                      <Button
                        onClick={toggleExpandAll}
                        variant="outline"
                        size="icon-sm"
                      >
                        {allExpanded ? <FoldVertical /> : <UnfoldVertical />}
                      </Button>
                    </TooltipWrapper>
                  </div>
                </PageBodyStickyContainer>
                <DataTable
                  columns={columns}
                  data={rows}
                  noData={
                    <DataTableNoData title="There are no logs for this rule." />
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
              </PageBodyScrollContainer>
            </div>
          )}
        </TabsContent>
        <TabsContent value="runs">
          <RunsTab ruleId={rule_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AutomationLogsPage;
