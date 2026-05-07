"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getModelDisplayName, getProviderLabel } from "@/lib/providers/models";
import type { Team } from "@/app/(app)/teams/actions";

const PROVIDER_CHIP_COLORS: Record<string, string> = {
  openai:    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  anthropic: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  google:    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  xai:       "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  custom:    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

interface TeamCardProps {
  team: Team;
  onEdit: (team: Team) => void;
  onDelete: (team: Team) => void;
}

export function TeamCard({ team, onEdit, onDelete }: TeamCardProps) {
  const memberCount = team.members.length;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm leading-snug">{team.name}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mt-1">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Team options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(team)}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(team)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 flex-1">
        {/* Provider + model chips */}
        <div className="flex flex-wrap gap-1.5">
          {team.members.map((member) => (
            <span
              key={member.id}
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                PROVIDER_CHIP_COLORS[member.provider] ?? "bg-muted text-muted-foreground"
              }`}
              title={`${getProviderLabel(member.provider)} — ${getModelDisplayName(member.provider, member.model)}`}
            >
              {getModelDisplayName(member.provider, member.model)}
            </span>
          ))}
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="default" className="text-xs">
            Primary: {getModelDisplayName(team.primary_provider, team.primary_model)}
          </Badge>
          <Badge variant="secondary" className="text-xs capitalize">
            {team.default_tone}
          </Badge>
        </div>

        {/* Footer */}
        <p className="text-xs text-muted-foreground pt-1">
          {memberCount} model{memberCount !== 1 ? "s" : ""} in this team
        </p>
      </CardContent>
    </Card>
  );
}
