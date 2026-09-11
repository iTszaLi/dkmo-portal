import { useMemo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Link, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { customFetch, useListMembers, getListMembersQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  DEPARTMENT_COLOR,
  departmentForDesignation,
  departmentIconFor,
  designationBadgeClass,
  initialsOf,
} from "@/lib/committee";
import { Users, Award, Search, Calendar, CheckCircle2, History, AlertCircle, Trash2, Plus, UserPlus } from "lucide-react";
import { format, parseISO } from "date-fns";

interface CommitteeTerm {
  id: string;
  committeeYear: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  memberCount: number;
}

interface CommitteeMemberAssignment {
  assignmentId: string;
  memberId: string;
  membershipId: string;
  legacyMemberId: string | null;
  fullName: string;
  photoUrl: string | null;
  position: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  permissions: string[];
}

interface CommitteeTermDetail {
  id: string;
  committeeYear: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  members: CommitteeMemberAssignment[];
}

const FELICITATED = [
  {
    name: "Ghani Ahmed Mulki",
    reason: "Outstanding contribution to DKMO's Loan Convenor role and community welfare initiatives spanning over a decade.",
    year: "2025",
    role: "Loan Convenor",
    icon: Award,
    color: "text-yellow-600 dark:text-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900/40",
  },
  {
    name: "Ashraf Kozhikan",
    reason: "Exceptional dedication to organizing DKMO community events, AGBM meetings, and cultural programs in Riyadh.",
    year: "2025",
    role: "Event Organizer",
    icon: Award,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900/40",
  },
  {
    name: "Shamsuddin Addoor",
    reason: "Tireless work in loan recovery, ensuring DKMO's financial sustainability while maintaining community trust.",
    year: "2025",
    role: "Loan Convenor (Recovery)",
    icon: Award,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/40",
  },
];

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "Ongoing";
  try {
    return format(parseISO(dateStr), "MMM d, yyyy");
  } catch (e) {
    return dateStr;
  }
};

export default function Committee() {
  const searchString = useSearch();
  const routeParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const [search, setSearch] = useState(routeParams.get("committeeSearch") ?? "");
  const [deptFilter, setDeptFilter] = useState(routeParams.get("committeeDepartment") ?? "all");
  const [selectedYear, setSelectedYear] = useState(routeParams.get("committeeYear") ?? "");
  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CommitteeMemberAssignment | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newCommittee, setNewCommittee] = useState({
    committeeYear: "",
    startDate: "",
    endDate: "",
    isActive: true,
  });
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedPosition, setSelectedPosition] = useState("");
  const [newAssignments, setNewAssignments] = useState<Array<{ memberId: string; position: string }>>([]);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const canRemoveMembers = user?.role === "admin";
  const { data: allMembers = [] } = useListMembers({}, {
    query: { enabled: createOpen, queryKey: getListMembersQueryKey() },
  });

  const { data: terms, isLoading: isLoadingTerms, error: termsError } = useQuery({
    queryKey: ["committee-terms"],
    queryFn: () => customFetch<CommitteeTerm[]>("/api/committee/terms"),
  });

  const activeTerm = useMemo(() => {
    if (!terms) return null;
    return terms.find(t => t.isActive) || terms[0];
  }, [terms]);

  useEffect(() => {
    if (activeTerm && selectedYear === "") {
      setSelectedYear(activeTerm.committeeYear);
    }
  }, [activeTerm, selectedYear]);

  const yearToFetch = selectedYear || activeTerm?.committeeYear;

  const { data: termDetail, isLoading: isLoadingDetail, error: detailError } = useQuery({
    queryKey: ["committee-terms", yearToFetch],
    queryFn: () => customFetch<CommitteeTermDetail>(`/api/committee/terms/${yearToFetch}`),
    enabled: !!yearToFetch,
  });

  const committeeMembers = useMemo(() => {
    if (!termDetail) return [];
    return termDetail.members.map(m => ({
      ...m,
      department: departmentForDesignation(m.position),
    }));
  }, [termDetail]);

  const departments = useMemo(
    () => [...new Set(committeeMembers.map((m) => m.department))].sort(),
    [committeeMembers],
  );

  const deptCounts = useMemo(
    () =>
      Object.fromEntries(
        departments.map((d) => [d, committeeMembers.filter((m) => m.department === d).length]),
      ),
    [departments, committeeMembers],
  );

  const filtered = committeeMembers.filter((m) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      m.fullName.toLowerCase().includes(q) ||
      m.position.toLowerCase().includes(q) ||
      m.department.toLowerCase().includes(q) ||
      m.membershipId.toLowerCase().includes(q) ||
      (m.legacyMemberId && m.legacyMemberId.toLowerCase().includes(q));
    const matchesDept = deptFilter === "all" || m.department === deptFilter;
    return matchesSearch && matchesDept;
  });

  const sortedMembers = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        // Active first
        if (a.isActive !== b.isActive) {
          return a.isActive ? -1 : 1;
        }
        // Executive dept first
        if (a.department === "Executive" && b.department !== "Executive") return -1;
        if (b.department === "Executive" && a.department !== "Executive") return 1;
        // Then by name
        return a.fullName.localeCompare(b.fullName);
      }),
    [filtered],
  );

  const isLoading = isLoadingTerms || (!!yearToFetch && isLoadingDetail);
  const error = termsError || detailError;

  const removeFromCommittee = async (member: CommitteeMemberAssignment) => {
    setRemovingAssignmentId(member.assignmentId);
    try {
      await customFetch(`/api/committee/assignments/${member.assignmentId}`, { method: "DELETE" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["committee-terms"] }),
        queryClient.invalidateQueries({ queryKey: ["committee-terms", yearToFetch] }),
      ]);
      toast({
        title: "Member removed from committee",
        description: `${member.fullName} is still available in Members and their historical records are unchanged.`,
      });
      setRemoveTarget(null);
    } catch (err) {
      toast({
        title: "Could not remove member",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRemovingAssignmentId(null);
    }
  };

  const openCreateCommittee = () => {
    setNewCommittee({
      committeeYear: "",
      startDate: "",
      endDate: "",
      isActive: true,
    });
    setSelectedMemberId("");
    setSelectedPosition("");
    setNewAssignments([]);
    setCreateOpen(true);
  };

  const addAssignment = () => {
    if (!selectedMemberId || !selectedPosition.trim()) {
      toast({ title: "Choose a member and enter a position", variant: "destructive" });
      return;
    }
    if (newAssignments.some((assignment) => assignment.memberId === selectedMemberId)) {
      toast({ title: "That member is already selected", variant: "destructive" });
      return;
    }
    setNewAssignments((current) => [...current, { memberId: selectedMemberId, position: selectedPosition.trim() }]);
    setSelectedMemberId("");
    setSelectedPosition("");
  };

  const saveNewCommittee = async () => {
    if (!newCommittee.committeeYear.trim() || !newCommittee.startDate || !newCommittee.endDate) {
      toast({ title: "Committee name and both dates are required", variant: "destructive" });
      return;
    }
    if (newCommittee.endDate < newCommittee.startDate) {
      toast({ title: "End date must be on or after the start date", variant: "destructive" });
      return;
    }

    setIsCreating(true);
    try {
      const created = await customFetch<CommitteeTerm>("/api/committee/terms", {
        method: "POST",
        body: JSON.stringify({
          ...newCommittee,
          committeeYear: newCommittee.committeeYear.trim(),
          assignments: newAssignments,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["committee-terms"] });
      setSelectedYear(created.committeeYear);
      setCreateOpen(false);
      toast({
        title: "Committee created",
        description: `${created.committeeYear} was saved with ${newAssignments.length} member assignment(s).`,
      });
    } catch (err) {
      toast({
        title: "Could not create committee",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const activateTerm = async (term: CommitteeTerm) => {
    try {
      await customFetch(`/api/committee/terms/${term.id}/activate`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["committee-terms"] });
      setSelectedYear(term.committeeYear);
      toast({ title: `${term.committeeYear} is now active`, description: "The previous active term remains preserved as historical." });
    } catch (err) {
      toast({
        title: "Could not activate committee",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const memberProfileHref = (memberId: string) => {
    const params = new URLSearchParams({
      from: "committee",
      committeeYear: termDetail?.committeeYear ?? selectedYear,
    });
    if (search) params.set("committeeSearch", search);
    if (deptFilter !== "all") params.set("committeeDepartment", deptFilter);
    return `/members/${memberId}?${params.toString()}`;
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-green-950 dark:text-green-100">
            DKMO Committee
          </h1>
          <p className="text-green-800/70 dark:text-slate-400 mt-1">
            Authoritative governance records · Dakshina Karnataka Muslim Okkoota, Riyadh
          </p>
        </div>

        <div className="flex items-center gap-3">
          {terms && terms.length > 0 && (
            <select
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(e.target.value);
                setDeptFilter("all");
              }}
              className="h-10 rounded-md border border-green-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm font-medium text-green-950 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 min-w-[140px]"
              aria-label="Select committee term"
            >
              {terms.map(term => (
                <option key={term.id} value={term.committeeYear}>
                  {term.committeeYear} Term {term.isActive ? "(Active)" : ""}
                </option>
              ))}
            </select>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-10 border-green-200 text-green-800 dark:border-slate-700 dark:text-green-300"
                data-testid="button-active-committee-menu"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {activeTerm ? `${activeTerm.committeeYear} Team Active` : "Committee Management"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="dark:bg-slate-900 dark:border-slate-800">
              <DropdownMenuLabel className="dark:text-slate-400">Committee management</DropdownMenuLabel>
              <DropdownMenuItem onClick={openCreateCommittee} className="dark:text-slate-200 dark:focus:bg-slate-800" data-testid="menu-create-committee">
                <Plus className="mr-2 h-4 w-4" /> Create New Committee
              </DropdownMenuItem>
              {terms?.some((term) => !term.isActive) && <DropdownMenuSeparator className="dark:bg-slate-800" />}
              {terms?.filter((term) => !term.isActive).map((term) => (
                <DropdownMenuItem
                  key={term.id}
                  onClick={() => void activateTerm(term)}
                  className="dark:text-slate-300 dark:focus:bg-slate-800"
                >
                  <History className="mr-2 h-4 w-4" /> Make {term.committeeYear} active
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {termDetail && (
            <div className={cn(
              "text-sm border px-3.5 py-1.5 rounded-full font-medium inline-flex items-center gap-2",
              termDetail.isActive
                ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300"
                : "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
            )}>
              {termDetail.isActive ? <CheckCircle2 className="h-4 w-4" /> : <History className="h-4 w-4" />}
              <span className="hidden sm:inline">
                {termDetail.isActive ? "Active Term" : "Historical Term"}
              </span>
            </div>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!isCreating) setCreateOpen(open); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">Create New Committee</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3 space-y-1.5">
                <label htmlFor="new-committee-name" className="text-sm font-medium text-slate-800 dark:text-slate-200">Committee Name</label>
                <Input
                  id="new-committee-name"
                  value={newCommittee.committeeYear}
                  onChange={(event) => setNewCommittee((current) => ({ ...current, committeeYear: event.target.value }))}
                  placeholder="2028–2029 Executive Committee"
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="new-committee-start" className="text-sm font-medium text-slate-800 dark:text-slate-200">Term Start Date</label>
                <Input
                  id="new-committee-start"
                  type="date"
                  value={newCommittee.startDate}
                  onChange={(event) => setNewCommittee((current) => ({ ...current, startDate: event.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="new-committee-end" className="text-sm font-medium text-slate-800 dark:text-slate-200">Term End Date</label>
                <Input
                  id="new-committee-end"
                  type="date"
                  value={newCommittee.endDate}
                  onChange={(event) => setNewCommittee((current) => ({ ...current, endDate: event.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                />
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={newCommittee.isActive}
                  onChange={(event) => setNewCommittee((current) => ({ ...current, isActive: event.target.checked }))}
                  className="h-4 w-4 accent-emerald-600"
                />
                Make this the active committee
              </label>
            </div>

            <div className="rounded-xl border border-emerald-100 dark:border-slate-800 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-emerald-600" />
                <p className="font-medium text-slate-900 dark:text-slate-200">Add members from the DKMO database</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
                <div className="space-y-1.5">
                  <label htmlFor="new-committee-member" className="text-xs font-medium text-slate-600 dark:text-slate-400">Member</label>
                  <select
                    id="new-committee-member"
                    value={selectedMemberId}
                    onChange={(event) => setSelectedMemberId(event.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                  >
                    <option value="">Select an existing member</option>
                    {allMembers
                      .filter((member) => !newAssignments.some((assignment) => assignment.memberId === member.id))
                      .sort((a, b) => a.fullName.localeCompare(b.fullName))
                      .map((member) => (
                        <option key={member.id} value={member.id}>{member.fullName} ({member.membershipId})</option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="new-committee-position" className="text-xs font-medium text-slate-600 dark:text-slate-400">Role / Position</label>
                  <Input
                    id="new-committee-position"
                    value={selectedPosition}
                    onChange={(event) => setSelectedPosition(event.target.value)}
                    placeholder="e.g. Treasurer"
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                  />
                </div>
                <Button type="button" variant="outline" onClick={addAssignment} className="border-emerald-200 text-emerald-700 dark:border-slate-700 dark:text-emerald-300">
                  <Plus className="mr-1.5 h-4 w-4" /> Add
                </Button>
              </div>

              {newAssignments.length > 0 ? (
                <div className="space-y-2">
                  {newAssignments.map((assignment, index) => {
                    const member = allMembers.find((candidate) => candidate.id === assignment.memberId);
                    return (
                      <div key={assignment.memberId} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2">
                        <span className="truncate text-sm text-slate-800 dark:text-slate-200">{member?.fullName ?? "Selected member"}</span>
                        <Input
                          value={assignment.position}
                          onChange={(event) => setNewAssignments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, position: event.target.value } : item))}
                          className="h-8 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                          aria-label={`Position for ${member?.fullName ?? "member"}`}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => setNewAssignments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                          className="h-8 w-8 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                          aria-label={`Remove ${member?.fullName ?? "member"} from new committee`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-500">No members selected yet. You can save an empty committee and add assignments later.</p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={isCreating}>Cancel</Button>
              <Button onClick={() => void saveNewCommittee()} disabled={isCreating} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                {isCreating ? "Saving…" : "Save Committee"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open && !removingAssignmentId) setRemoveTarget(null); }}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-slate-100">Remove committee member?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-slate-400">
              Remove {removeTarget?.fullName ?? "this member"} from the {termDetail?.committeeYear ?? "selected"} committee? Their member profile and historical records will remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!removingAssignmentId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!removeTarget || !!removingAssignmentId}
              onClick={() => { if (removeTarget) void removeFromCommittee(removeTarget); }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {removingAssignmentId ? "Removing…" : "Remove from committee"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {error ? (
        <Card className="border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20">
          <CardContent className="py-12 flex flex-col items-center text-center">
            <AlertCircle className="h-10 w-10 text-red-500 mb-4" />
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-300">Failed to load committee records</h3>
            <p className="text-red-700 dark:text-red-400 mt-2 max-w-md">
              An error occurred while fetching authoritative committee terms. Please try again later.
            </p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : (!terms || terms.length === 0) ? (
        <Card className="rounded-2xl border-green-100 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-200">No Committee Terms</h3>
            <p className="text-slate-500 mt-1">There are no documented committee terms in the system yet.</p>
          </CardContent>
        </Card>
      ) : termDetail ? (
        <>
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Calendar className="h-4 w-4 text-slate-400" />
              <span className="font-medium text-slate-900 dark:text-slate-100">Term Dates:</span>
              {formatDate(termDetail.startDate)} — {formatDate(termDetail.endDate)}
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Users className="h-4 w-4 text-slate-400" />
              <span className="font-medium text-slate-900 dark:text-slate-100">Total Members:</span>
              {termDetail.members.length}
            </div>
          </div>

          {/* Search bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-400 dark:text-slate-500" />
              <Input
                placeholder="Search member, position, ID, or department..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 border-green-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
              />
            </div>
            {departments.length > 0 && (
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="h-10 rounded-md border border-green-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-green-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500/30"
              >
                <option value="all">All Departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}
          </div>

          {/* Department breakdown */}
          {departments.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {departments.map((dept) => {
                const Icon = departmentIconFor(dept);
                const isActive = deptFilter === dept;
                return (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => setDeptFilter(isActive ? "all" : dept)}
                    aria-pressed={isActive}
                    data-testid={`button-dept-${dept.toLowerCase()}`}
                    className={cn(
                      "text-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm",
                      "transition-all hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500",
                      isActive && "ring-2 ring-green-500 dark:ring-green-400 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20",
                    )}
                  >
                    <Icon className={cn("h-5 w-5 mx-auto mb-1", DEPARTMENT_COLOR[dept] ?? "text-slate-600 dark:text-slate-400")} />
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-200">{deptCounts[dept]}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{dept}</p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Committee Members */}
          <section>
            {sortedMembers.length === 0 ? (
              <Card className="rounded-2xl border-slate-200 dark:border-slate-800 dark:bg-slate-900 shadow-sm mt-4">
                <CardContent className="py-12 text-center text-slate-500">
                  No committee assignments match the current filters.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
                {sortedMembers.map((m) => (
                  <MemberCard
                    key={m.assignmentId}
                    member={m}
                    profileHref={memberProfileHref(m.memberId)}
                    canRemove={canRemoveMembers}
                    isRemoving={removingAssignmentId === m.assignmentId}
                    onRemove={() => setRemoveTarget(m)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {/* Felicitation Section - only show with the historical 2025 term. */}
      {(termDetail?.committeeYear === "2025") && (
        <Card className="rounded-2xl border-amber-100 dark:border-amber-900/30 dark:bg-slate-900 shadow-sm mt-12">
          <CardHeader>
            <CardTitle className="text-lg text-amber-900 dark:text-amber-300 flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-500" />
              Felicitation — Recognized Members 2025
            </CardTitle>
            <CardDescription className="dark:text-slate-400">
              Honoring outstanding contributions to the DKMO community
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {FELICITATED.map((f) => (
              <div key={f.name} className={cn("rounded-xl border p-4 space-y-3", f.bg)}>
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-white dark:bg-slate-800 border border-white/60 dark:border-slate-700 flex items-center justify-center shrink-0 text-sm font-bold text-amber-800 dark:text-amber-300">
                    {initialsOf(f.name)}
                  </div>
                  <div>
                    <p className="font-semibold text-amber-950 dark:text-slate-200 text-sm leading-snug">{f.name}</p>
                    <p className="text-xs text-amber-700/70 dark:text-slate-400">{f.role}</p>
                  </div>
                </div>
                <p className="text-xs text-amber-800/80 dark:text-slate-300 leading-relaxed">{f.reason}</p>
                <div className="flex items-center gap-2">
                  <f.icon className={cn("h-4 w-4", f.color)} />
                  <span className={cn("text-xs font-semibold", f.color)}>Felicitated {f.year}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MemberCard({
  member,
  profileHref,
  canRemove,
  isRemoving,
  onRemove,
}: {
  member: CommitteeMemberAssignment & { department: string };
  profileHref: string;
  canRemove: boolean;
  isRemoving: boolean;
  onRemove: () => void;
}) {
  const Icon = departmentIconFor(member.department);
  const isCurrentlyActive = member.isActive;

  return (
    <div className={cn(
      "rounded-xl border p-4 transition-shadow hover:shadow-md dark:hover:shadow-black/20 flex flex-col h-full",
      isCurrentlyActive
        ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
        : "bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800/60 opacity-90",
    )}>
      <Link
        href={profileHref}
        className="flex items-start gap-3 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
        aria-label={`Open ${member.fullName}'s member profile`}
        title={`Open ${member.fullName}'s profile`}
      >
        {member.photoUrl ? (
          <img
            src={member.photoUrl}
            alt={`${member.fullName} photo`}
            className="h-11 w-11 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
          />
        ) : (
          <div className="rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 font-bold text-slate-600 dark:text-slate-300 h-11 w-11 text-sm">
            {initialsOf(member.fullName)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <p className={cn(
              "font-semibold leading-snug text-base truncate",
              isCurrentlyActive ? "text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300"
            )}>
              {member.fullName}
            </p>
            <span className={cn(
              "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold shrink-0 border",
              isCurrentlyActive
                ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900/50"
                : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
            )}>
              {isCurrentlyActive ? "Active" : "Ended"}
            </span>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mt-0.5 leading-snug text-sm">
            <span className={cn("inline-flex rounded-full border border-transparent px-2 py-0.5 text-xs font-semibold", designationBadgeClass(member.position))}>
              {member.position}
            </span>
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded text-[10px]">
              ID: {member.membershipId}
            </span>
            {member.legacyMemberId && (
              <span className="font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded text-[10px]" title="Legacy ID">
                Legacy: {member.legacyMemberId}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <span className={cn("flex items-center gap-1 text-[10px] font-medium", DEPARTMENT_COLOR[member.department] ?? "text-slate-600 dark:text-slate-400")}>
              <Icon className="h-3 w-3" />
              {member.department}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(member.startDate)} {member.endDate ? `— ${formatDate(member.endDate)}` : ''}
            </span>
          </div>
        </div>
      </Link>
      {canRemove && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={isRemoving}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
            data-testid={`button-remove-committee-${member.membershipId}`}
            aria-label={`Remove ${member.fullName} from committee`}
            title={`Remove ${member.fullName} from committee`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}