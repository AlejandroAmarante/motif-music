import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, FolderCog, Clock, AlertTriangle } from "lucide-react";
import { FolderPicker } from "../components/library/FolderPicker.jsx";
import { Toggle } from "../components/common/Toggle.jsx";
import { SectionTitle } from "../components/common/SectionTitle.jsx";
import { useLibrary } from "../state/LibraryContext.jsx";

const SCAN_OPTIONS = [
	{ value: "manual", label: "Manual only" },
	{ value: "startup", label: "On app startup" },
	{ value: "interval-5", label: "Every few minutes" },
	{ value: "interval-60", label: "Every hour" },
	{ value: "watch", label: "Watch for changes (experimental)" },
];

const overlayTransition = {
	duration: 0.28,
	ease: [0.22, 1, 0.36, 1],
};

export function ConnectedFoldersView({ isOpen, onClose }) {
	const {
		scanMode,
		setScanMode,
		autoRemoveMissing,
		setAutoRemoveMissing,
		watchSupported,
	} = useLibrary();

	return (
		<AnimatePresence>
			{isOpen && (
				<motion.div
					key="connected-folders"
					className="settings-overlay"
					initial={{ y: "100%" }}
					animate={{ y: 0 }}
					exit={{ y: "100%" }}
					transition={overlayTransition}
				>
					<div className="now-playing__handle-zone">
						<button
							className="now-playing__collapse"
							onClick={onClose}
							aria-label="Close connected folders"
						>
							<ChevronDown size={25} strokeWidth={2} />
						</button>

						<span className="now-playing__eyebrow">
							Connected Folders
						</span>

						<div className="now-playing__spacer" />
					</div>

					<div className="view__scroll scroll-region settings-overlay__body">
						<section>
							<SectionTitle icon={FolderCog}>
								Folders
							</SectionTitle>
							<FolderPicker />
						</section>

						<section>
							<SectionTitle icon={Clock}>
								Rescan frequency
							</SectionTitle>

							<select
								className="connected-folders__select"
								value={scanMode}
								onChange={(e) =>
									setScanMode(e.target.value)
								}
							>
								{SCAN_OPTIONS.map((opt) => (
									<option
										key={opt.value}
										value={opt.value}
										disabled={
											opt.value === "watch" &&
											!watchSupported
										}
									>
										{opt.label}
										{opt.value === "watch" &&
										!watchSupported
											? " — unsupported here"
											: ""}
									</option>
								))}
							</select>

							<p className="settings-overlay__note">
								Controls how often Motif checks your
								connected folders for new, changed, or
								removed files. More frequent checks cost
								a bit more battery and CPU; manual is the
								lightest option.
							</p>
						</section>

						<section>
							<SectionTitle icon={AlertTriangle}>
								Missing files
							</SectionTitle>

							<Toggle
								id="auto-remove-missing"
								checked={autoRemoveMissing}
								onChange={setAutoRemoveMissing}
								label="Automatically remove unavailable songs"
								description="Off by default: unreachable files are greyed out in Library so you can remove them yourself."
							/>
						</section>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
;
