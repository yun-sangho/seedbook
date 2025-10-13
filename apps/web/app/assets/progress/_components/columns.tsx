"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@web/components/ui/button";
import type { AssetProgressPoint } from "@web/features/assets/types/progress";
import { numberToKorean } from "@web/utils/number-format";
import { ArrowUpDown } from "lucide-react";

export const progressColumns: ColumnDef<AssetProgressPoint>[] = [
  {
    accessorKey: "date",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          날짜
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const dateValue = row.getValue("date") as string;
      const date = new Date(dateValue);
      const dateFormatted = isNaN(date.getTime()) ? dateValue : date.toLocaleDateString("ko-KR");
      return <div className="font-medium">{dateFormatted}</div>;
    },
  },
  {
    accessorKey: "investments",
    header: ({ column }) => {
      return (
        <div className="text-right">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            투자
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        </div>
      );
    },
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("investments"));
      return <div className="text-right">{numberToKorean(amount.toString())}</div>;
    },
  },
  {
    accessorKey: "savings",
    header: ({ column }) => {
      return (
        <div className="text-right">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            저축
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        </div>
      );
    },
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("savings"));
      return <div className="text-right">{numberToKorean(amount.toString())}</div>;
    },
  },
  {
    accessorKey: "realAssets",
    header: ({ column }) => {
      return (
        <div className="text-right">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            실물자산
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        </div>
      );
    },
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("realAssets"));
      return <div className="text-right">{numberToKorean(amount.toString())}</div>;
    },
  },
  {
    accessorKey: "loans",
    header: ({ column }) => {
      return (
        <div className="text-right">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            부채
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        </div>
      );
    },
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("loans"));
      return <div className="text-right">{"-" + numberToKorean(amount.toString())}</div>;
    },
  },
  {
    accessorKey: "totalAssets",
    header: ({ column }) => {
      return (
        <div className="text-right">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            자산 총액
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        </div>
      );
    },
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("totalAssets"));
      return <div className="text-right">{numberToKorean(amount.toString())}</div>;
    },
  },
  {
    accessorKey: "netAssets",
    header: ({ column }) => {
      return (
        <div className="text-right">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            순자산
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        </div>
      );
    },
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("netAssets"));
      return <div className="text-right font-semibold">{numberToKorean(amount.toString())}</div>;
    },
  },
];
