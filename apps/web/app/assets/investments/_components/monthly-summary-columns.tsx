"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@web/components/ui/button";
import { formatReturnRate, numberToKorean } from "@web/utils/number-format";
import { getProfitColorClass, getProfitPrefix } from "@web/utils/profit-color";
import { ArrowUpDown } from "lucide-react";

export interface MonthlySummaryRow {
  yearMonth: string; // "YYYY-MM" format
  displayMonth: string; // Display format like "2024년 1월"
  initialInvestment: number;
  currentValue: number;
  profit: number;
  returnRate: number;
}

export const columns: ColumnDef<MonthlySummaryRow>[] = [
  {
    accessorKey: "displayMonth",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          기준월
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      return <div className="font-medium">{row.getValue("displayMonth")}</div>;
    },
    sortingFn: (rowA, rowB) => {
      // Sort by yearMonth instead of displayMonth for correct chronological order
      return rowA.original.yearMonth.localeCompare(rowB.original.yearMonth);
    },
  },
  {
    accessorKey: "initialInvestment",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          투자원금
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const value = row.getValue("initialInvestment") as number;
      return <div className="text-right">{numberToKorean(value)}</div>;
    },
  },
  {
    accessorKey: "currentValue",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          평가금액
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const value = row.getValue("currentValue") as number;
      return <div className="text-right font-medium">{numberToKorean(value)}</div>;
    },
  },
  {
    accessorKey: "profit",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          수익금 (전월대비)
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const value = row.getValue("profit") as number;
      return (
        <div className={`text-right font-medium ${getProfitColorClass(value)}`}>
          {getProfitPrefix(value)}
          {numberToKorean(value)}
        </div>
      );
    },
  },
  {
    accessorKey: "returnRate",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          수익률 (전월대비)
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const value = row.getValue("returnRate") as number;
      return (
        <div className={`text-right font-medium ${getProfitColorClass(value)}`}>
          {formatReturnRate(value)}
        </div>
      );
    },
  },
];
