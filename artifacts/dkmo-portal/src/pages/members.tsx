import { useState } from "react";
import { Link } from "wouter";
import { useListMembers, useCreateMember, useUpdateMember, useDeleteMember, getListMembersQueryKey } from "@workspace/api-client-react";
import { MemberInput } from "@workspace/api-client-react/src/generated/api.schemas";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MemberForm } from "@/components/MemberForm";
import { Search, Plus, UserCircle, MapPin, Phone, MoreHorizontal, Edit, Trash } from "lucide-react";
import { formatSAR, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function Members() {
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [deletingMember, setDeletingMember] = useState<any>(null);

  const { data: members, isLoading } = useListMembers({ search: search.length > 2 ? search : undefined });
  const createMember = useCreateMember();
  const updateMember = useUpdateMember();
  const deleteMember = useDeleteMember();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleCreate = (data: MemberInput) => {
    createMember.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        setIsAddOpen(false);
        toast({ title: "Member created successfully", variant: "default" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to create member", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleUpdate = (data: MemberInput) => {
    if (!editingMember) return;
    updateMember.mutate({ id: editingMember.id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        setEditingMember(null);
        toast({ title: "Member updated successfully", variant: "default" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to update member", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleDelete = () => {
    if (!deletingMember) return;
    deleteMember.mutate({ id: deletingMember.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        setDeletingMember(null);
        toast({ title: "Member deleted successfully", variant: "default" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to delete member", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">Members</h1>
          <p className="text-emerald-700/80 dark:text-slate-400">Manage trust members and their details</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white">
              <Plus className="mr-2 h-4 w-4" /> Add Member
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] dark:bg-slate-900 dark:border-slate-800">
            <DialogHeader>
              <DialogTitle className="dark:text-slate-100">Add New Member</DialogTitle>
            </DialogHeader>
            <MemberForm onSubmit={handleCreate} isSubmitting={createMember.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center space-x-2 bg-white dark:bg-slate-900 p-2 rounded-lg border border-emerald-100 dark:border-slate-800 shadow-sm max-w-md">
        <Search className="h-5 w-5 text-emerald-400 dark:text-slate-500 ml-2 shrink-0" />
        <Input
          placeholder="Search by name, ID, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-0 focus-visible:ring-0 shadow-none px-2 h-9 dark:bg-transparent dark:text-slate-200 dark:placeholder:text-slate-500"
        />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-emerald-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-emerald-50/50 dark:bg-slate-800/60">
            <TableRow className="dark:border-slate-700">
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Member</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Contact</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300">Location</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Monthly Dues</TableHead>
              <TableHead className="font-semibold text-emerald-900 dark:text-slate-300 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="dark:border-slate-800">
                  <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : members?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-emerald-600 dark:text-slate-500">
                  No members found.
                </TableCell>
              </TableRow>
            ) : (
              members?.map((member) => (
                <TableRow key={member.id} className="hover:bg-emerald-50/30 dark:hover:bg-slate-800/50 cursor-pointer dark:border-slate-800 transition-colors">
                  <TableCell>
                    <Link href={`/members/${member.id}`} className="flex items-center gap-3 w-full">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 shrink-0">
                        <UserCircle className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-medium text-emerald-950 dark:text-slate-200">{member.fullName}</div>
                        <div className="text-xs text-emerald-600 dark:text-slate-500">ID: {member.membershipId}</div>
                        {(member as any).designation ? (
                          <div className="mt-1 inline-block px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-[10px] font-semibold uppercase tracking-wide">
                            {(member as any).designation}
                          </div>
                        ) : null}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center text-sm text-emerald-800 dark:text-slate-300">
                      <Phone className="mr-2 h-3.5 w-3.5 text-emerald-500 dark:text-emerald-600 shrink-0" />
                      {member.mobileNumber}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center text-sm text-emerald-800 dark:text-slate-300">
                      <MapPin className="mr-2 h-3.5 w-3.5 text-emerald-500 dark:text-emerald-600 shrink-0" />
                      {member.city}, {member.country}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-emerald-900 dark:text-green-300">
                    {formatSAR(member.monthlyAmount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="dark:bg-slate-900 dark:border-slate-800">
                        <DropdownMenuItem asChild>
                          <Link href={`/members/${member.id}`} className="cursor-pointer flex w-full items-center dark:text-slate-300 dark:focus:bg-slate-800">
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditingMember(member)} className="dark:text-slate-300 dark:focus:bg-slate-800">
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeletingMember(member)} className="text-red-600 dark:text-red-400 dark:focus:bg-slate-800">
                          <Trash className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
        <DialogContent className="sm:max-w-[500px] dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">Edit Member</DialogTitle>
          </DialogHeader>
          {editingMember && (
            <MemberForm
              defaultValues={editingMember}
              onSubmit={handleUpdate}
              isSubmitting={updateMember.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingMember} onOpenChange={(open) => !open && setDeletingMember(null)}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-slate-100">Are you sure?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-slate-400">
              This will permanently delete the member "{deletingMember?.fullName}" and all associated records.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
