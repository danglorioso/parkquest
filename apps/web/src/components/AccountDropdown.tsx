import { useUser } from "@clerk/nextjs";
import { CheckCircle2, Mail, LogOut, UserRound, Pencil, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function AccountDropdown({
    isOpen,
    onSignOut,
    username,
    onEditProfile,
}: {
    isOpen: boolean;
    onSignOut: () => void;
    username: string | null;
    onEditProfile: () => void;
}) {
    const { user } = useUser();

    const fullName = user?.firstName && user?.lastName
        ? `${user.firstName} ${user.lastName}`
        : user?.firstName || user?.lastName || 'User';

    const emailVerified = user?.emailAddresses?.find(email => email.id === user.primaryEmailAddressId)?.verification?.status === 'verified';

    if (!isOpen) return null;

    return (
        <div className="dropdown-enter absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg">
            <div className="p-6 space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h3>
                    <div className="space-y-4">
                        {username && (
                            <div>
                                <p className="text-sm font-medium text-gray-500">Username</p>
                                <Link
                                    href={`/profile/${username}`}
                                    className="flex items-center gap-1.5 text-base text-emerald-600 hover:underline font-medium"
                                >
                                    <UserRound className="h-4 w-4" />
                                    @{username}
                                </Link>
                            </div>
                        )}
                        <div>
                            <p className="text-sm font-medium text-gray-500">Name</p>
                            <p className="text-lg font-semibold">{fullName}</p>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Email</p>
                            <div className="flex items-center gap-2 mt-1">
                                <Mail className="h-4 w-4 text-gray-400" />
                                <p className="text-base">{user?.primaryEmailAddress?.emailAddress}</p>
                            </div>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Email Status</p>
                            <div className="flex items-center gap-1 mt-1">
                                {emailVerified ? (
                                    <>
                                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                                        <span className="text-sm text-green-600">Verified</span>
                                    </>
                                ) : (
                                    <span className="text-sm text-yellow-600">Pending verification</span>
                                )}
                            </div>
                        </div>
                        {user?.createdAt && (
                            <div>
                                <p className="text-sm font-medium text-gray-500">Member since</p>
                                <p className="text-base">{new Date(user.createdAt).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                })}</p>
                            </div>
                        )}
                    </div>
                </div>
                <div className="border-t border-gray-200 pt-4 space-y-2">
                    <button
                        onClick={onEditProfile}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition font-medium"
                    >
                        <Pencil className="h-4 w-4" />
                        Edit Profile
                    </button>
                    <Link
                        href="/settings"
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition font-medium"
                    >
                        <ShieldCheck className="h-4 w-4" />
                        Privacy &amp; Safety
                    </Link>
                    <button
                        onClick={onSignOut}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition font-medium"
                    >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                    </button>
                </div>
            </div>
        </div>
    );
}
