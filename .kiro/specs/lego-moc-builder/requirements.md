# Requirements Document

## Introduction

The LEGO MOC Builder is an application for LEGO enthusiasts to organize their brick collections using AI-assisted camera scanning, discover community-shared MOC (My Own Creation) designs, find alternative rebuild ideas for owned sets, and get creative display inspiration. The app supports personal use and sharing among family and friends. It integrates with public LEGO data sources (part catalogs, set databases, community MOC repositories) and AI-powered image recognition to provide actionable building suggestions based on the user's actual inventory. The application uses a camera-first approach for brick identification and supports a numbered-bag storage system for physical organization.

## Glossary

- **App**: The LEGO MOC Builder application
- **Brick**: An individual LEGO element identified by part number, color, and category
- **Set**: An official LEGO product identified by set number, containing a defined list of Bricks
- **MOC**: My Own Creation — a custom LEGO build designed by a community member, not an official LEGO set
- **Inventory**: A user's complete collection of Bricks, including loose Bricks and Bricks from owned Sets
- **Collection**: The list of official Sets a user owns
- **Rebuild_Idea**: An alternative build suggestion that uses Bricks from one or more owned Sets
- **Display_Idea**: A creative suggestion for how to physically present or showcase a completed build
- **Part_Coverage**: The percentage of Bricks required by a MOC or Rebuild_Idea that exist in the user's Inventory
- **User**: A person who has registered and uses the App
- **Catalog**: The reference database of all known LEGO parts, colors, and sets
- **Scan_Session**: A camera-based session where the App identifies Bricks from a photo or live feed
- **Storage_Bag**: A numbered transparent bag used to physically store Bricks, tracked by the App
- **Recognition_Service**: The AI-powered backend service that identifies Bricks from camera images, using one or more pluggable recognition backends (such as custom-trained models, multimodal AI vision APIs, or third-party recognition services)
- **Review_Step**: A mandatory user confirmation step where identified Bricks can be manually corrected before committing to the Inventory
- **Data_Provider**: An external service or API that supplies Catalog data (such as Rebrickable API, BrickLink API)

## Requirements

### Requirement 1: AI-Assisted Brick Scanning and Entry

**User Story:** As a User, I want to scan my Bricks using my phone camera, so that I can quickly add them to my Inventory without manual part-by-part entry.

#### Acceptance Criteria

1. WHEN a User initiates a Scan_Session, THE App SHALL request camera access and, upon permission being granted, activate the device camera and capture images of Bricks for identification.
2. IF the device denies camera permission when a User initiates a Scan_Session, THEN THE App SHALL display an error message indicating that camera access is required and provide a way to navigate to device settings.
3. WHEN the App captures an image during a Scan_Session, THE Recognition_Service SHALL identify each visible Brick by part number, color, and quantity within 10 seconds of image capture.
4. WHEN the Recognition_Service completes identification, THE App SHALL present the results in a Review_Step displaying each identified Brick with part number, color, quantity, and confidence level as a percentage from 0% to 100%.
5. WHILE in the Review_Step, THE App SHALL allow the User to add, remove, or modify any identified Brick's part number, color, or quantity before committing.
6. WHEN the User confirms the Review_Step, THE App SHALL add the confirmed Bricks to the User's Inventory with the specified quantities.
7. IF the Recognition_Service identifies a Brick with a confidence level below 70%, THEN THE App SHALL flag that Brick in the Review_Step for manual identification by the User.
8. IF the Recognition_Service is unreachable or returns an error during a Scan_Session, THEN THE App SHALL display an error message indicating that recognition is unavailable and allow the User to retry or cancel the Scan_Session.
9. IF the Recognition_Service identifies no Bricks in a captured image, THEN THE App SHALL display a message indicating that no Bricks were detected and allow the User to capture another image.
10. THE App SHALL support pluggable recognition backends, including pre-trained multimodal AI vision APIs (such as AWS Bedrock with Claude Vision) that require no custom model training by the User.
11. WHEN a User adds a Set by set number, THE App SHALL import all Bricks from that Set into the User's Inventory using data from the Catalog.
12. WHEN a User manually adds loose Bricks by part number and color, THE App SHALL add those Bricks to the User's Inventory with the specified quantity.
13. IF a User provides an invalid set number or part number, THEN THE App SHALL display an error message indicating that the specified item was not found in the Catalog.

### Requirement 2: Brick Inventory Management

**User Story:** As a User, I want to manage my Brick Inventory, so that I can track which Bricks I have available for building.

#### Acceptance Criteria

1. THE App SHALL display the User's complete Inventory grouped by category, color, or part number based on User preference.
2. WHEN a User removes Bricks from the Inventory, THE App SHALL decrease the quantity of the specified Brick by the specified amount and remove the Brick entry from the displayed Inventory when its total quantity reaches zero.
3. WHEN a User marks a Set as "built," THE App SHALL mark the Set's Bricks as unavailable (in use) in the Inventory.
4. WHEN a User marks a Set as "disassembled," THE App SHALL mark the Set's Bricks as available in the Inventory.
5. THE App SHALL display the total Brick count and a breakdown by availability status (available, in-use, in-storage).
6. IF a User attempts to remove a quantity of Bricks that exceeds the available quantity of that Brick, THEN THE App SHALL reject the removal and display an error message indicating the maximum available quantity.
7. IF a User marks a Set as "built" and one or more of the Set's Bricks are already marked as in-use or in-storage, THEN THE App SHALL display a conflict notification listing the unavailable Bricks and their current status before requiring User confirmation to proceed.

### Requirement 3: Numbered Bag Storage System

**User Story:** As a User, I want to store my loose Bricks in numbered transparent bags and have the App track which Bricks are in which bag, so that I can quickly locate specific Bricks when building.

#### Acceptance Criteria

1. WHEN a User creates a new Storage_Bag, THE App SHALL assign the next sequential bag number starting from 1 and associate it with the User's account.
2. WHEN a User scans Bricks to store in a Storage_Bag, THE App SHALL associate the identified Bricks (after Review_Step confirmation) with that bag number in the Inventory, recording part number, color, and quantity per Brick.
3. WHEN a User selects a Brick from the Inventory, THE App SHALL display all Storage_Bag numbers containing that Brick along with the quantity available in each bag.
4. WHEN a User removes a Brick from a Storage_Bag during a building session, THE App SHALL decrease the quantity of that Brick in the specified bag by the amount removed.
5. IF the quantity of a Brick in a Storage_Bag reaches zero after removal, THEN THE App SHALL remove that Brick's association from the bag.
6. WHEN a User ends a building session and selects the option to store remaining Bricks, THE App SHALL allow the User to scan remaining Bricks and assign them to a new or existing Storage_Bag.
7. THE App SHALL display a Storage_Bag overview showing all bags with their bag number, the number of distinct Brick types, and total Brick count per bag.
8. WHEN a User searches for a Brick by part number or color, THE App SHALL display the Storage_Bag number(s) containing that Brick alongside the quantity available in each bag.
9. IF a User attempts to store Bricks in a Storage_Bag that are not present in the User's available Inventory, THEN THE App SHALL display an error message indicating which Bricks are not available for storage.

### Requirement 4: Set Collection Tracking

**User Story:** As a User, I want to track which official LEGO Sets I own, so that I can see my complete collection and identify Bricks available for building.

#### Acceptance Criteria

1. WHEN a User adds a Set to the Collection, THE App SHALL store the Set with its metadata (name, theme, piece count, year) from the Catalog.
2. THE App SHALL display the User's Collection with set images, names, themes, and current build status (built, disassembled, partial), where "partial" indicates a Set with some Bricks marked as available and some as in-use.
3. WHEN a User searches for a Set, THE App SHALL return up to 50 matching Sets from the Catalog by set number, name, or theme.
4. WHEN a User removes a Set that is marked as "disassembled" from the Collection, THE App SHALL remove the Set's Bricks from the Inventory.
5. IF a User attempts to remove a Set that is marked as "built" or "partial," THEN THE App SHALL display a warning indicating that associated Bricks are currently in use and require the User to confirm before removal.
6. IF a User adds a Set that already exists in their Collection, THEN THE App SHALL display a notification indicating the Set is already owned and allow the User to confirm adding a duplicate or cancel the action.

### Requirement 5: MOC Discovery

**User Story:** As a User, I want to browse publicly available MOC designs from community sources, so that I can find inspiration and new things to build with my Bricks.

#### Acceptance Criteria

1. WHEN a User browses MOC designs, THE App SHALL display a paginated list of MOCs sourced from public community repositories with thumbnail images, titles, designers, and piece counts, showing no more than 50 MOCs per page.
2. WHEN a User filters MOCs by theme or category, THE App SHALL display only MOCs matching the selected criteria.
3. WHEN a User selects a MOC, THE App SHALL display the MOC details including required parts list, building instructions link (if available), and designer information.
4. WHEN a User requests a buildability check for a MOC, THE App SHALL calculate and display the Part_Coverage percentage, defined as the number of required parts matched in the User's available Inventory divided by the total number of required parts for that MOC, multiplied by 100 and rounded to the nearest whole number, matching parts by both part number and color.
5. IF Part_Coverage for a MOC is below 100%, THEN THE App SHALL display the list of missing Bricks with quantities needed.
6. WHILE the User has an Inventory loaded, THE App SHALL sort MOC search results by Part_Coverage in descending order, placing most-buildable MOCs first.
7. THE App SHALL allow Users to save up to 200 favorite MOCs to a personal wishlist for future reference.
8. IF the community data source is unavailable when the User browses or searches MOC designs, THEN THE App SHALL display a message indicating that MOC data cannot be loaded and prompt the User to retry.

### Requirement 6: Alternative Rebuild Ideas

**User Story:** As a User, I want to find alternative rebuild ideas for Sets I own, so that I can create new builds using Bricks I already have.

#### Acceptance Criteria

1. WHEN a User selects one or more Sets (up to 10) from the Collection, THE App SHALL suggest Rebuild_Ideas that can be constructed from the combined Bricks of those Sets, displaying only Rebuild_Ideas with a Part_Coverage of 50% or higher, sorted by Part_Coverage descending.
2. THE App SHALL display each Rebuild_Idea with a title, image, Part_Coverage percentage, and difficulty level (Beginner, Intermediate, or Advanced as sourced from the Data_Provider).
3. WHEN a User selects a Rebuild_Idea, THE App SHALL display the full parts list and building instructions (if available).
4. WHEN a Rebuild_Idea requires Bricks not present in the selected Sets, THE App SHALL display the missing Bricks with part number, color, and quantities needed.
5. THE App SHALL allow Users to filter Rebuild_Ideas by theme, difficulty level, and minimum Part_Coverage percentage (adjustable from 50% to 100%).
6. IF no Rebuild_Ideas meet the minimum Part_Coverage threshold for the selected Sets, THEN THE App SHALL display a message indicating no matching Rebuild_Ideas were found and suggest selecting additional Sets.

### Requirement 7: Display Inspiration

**User Story:** As a User, I want to get creative display ideas for my builds, so that I can showcase them attractively.

#### Acceptance Criteria

1. WHEN a User requests display ideas for a completed build (a Set marked as "built" or a MOC marked as complete), THE App SHALL suggest at least 3 Display_Ideas that match the build's theme tag and belong to the same scale category (small, medium, large).
2. THE App SHALL present each Display_Idea with a reference image, a description of 20 to 300 characters, the display category (shelf, wall-mount, diorama, lighting, or stand), and a list of any additional materials needed.
3. WHEN a User filters Display_Ideas by category (shelf, wall-mount, diorama, lighting, stand), THE App SHALL display only ideas matching the selected category.
4. THE App SHALL allow Users to save up to 100 favorite Display_Ideas to a personal collection for future reference.
5. IF no Display_Ideas match the build's theme and scale or the selected filter category, THEN THE App SHALL display a message indicating no matching ideas were found and suggest the User try a different category.

### Requirement 8: User Accounts and Sharing

**User Story:** As a User, I want to share my Collection and build progress with family and friends, so that we can inspire each other and coordinate on builds.

#### Acceptance Criteria

1. WHEN a new User registers, THE App SHALL create an account with a unique username (3 to 30 characters, alphanumeric and underscores only) and a password of at least 8 characters containing at least one uppercase letter, one lowercase letter, and one digit.
2. WHEN a User shares their Collection or Inventory, THE App SHALL allow the User to invite one or more registered Users by username and generate a shareable link accessible only to those invited Users.
3. THE App SHALL limit access to shared content to registered Users who have been explicitly invited by the sharing User, supporting a maximum of 20 invited Users per shared Collection or Inventory.
4. WHEN an invited User views a shared Collection, THE App SHALL display the sharing User's Sets with names, themes, and build status, and their Inventory Brick counts grouped by category.
5. IF an uninvited User attempts to access shared content, THEN THE App SHALL deny access and display an error message indicating the User does not have permission to view the content.
6. WHEN a sharing User revokes access for an invited User, THE App SHALL immediately prevent that User from viewing the shared content.
7. WHEN a User shares content, THE App SHALL allow the User to choose whether to share their Collection, their Inventory, or both.

### Requirement 9: Catalog Data Integration

**User Story:** As a User, I want the App to have up-to-date LEGO part and set data, so that I can accurately manage my Inventory and discover compatible builds.

#### Acceptance Criteria

1. THE App SHALL maintain a Catalog of LEGO parts including part number, name, category, available colors, and reference images.
2. THE App SHALL maintain a Catalog of LEGO Sets including set number, name, theme, year, piece count, and parts list.
3. THE App SHALL check the Catalog data source for updates every 12 hours and synchronize new data within 24 hours of a detected update.
4. IF the Catalog data source is unavailable during synchronization, THEN THE App SHALL retry synchronization after 1 hour, up to a maximum of 3 retries.
5. IF all synchronization retries are exhausted, THEN THE App SHALL notify the User that Catalog data may be outdated and continue serving cached data until the next scheduled sync check.
6. THE App SHALL source Catalog data from the Rebrickable API as the primary Data_Provider and provide attribution to Rebrickable.
7. THE App SHALL support integration with additional Data_Providers (such as BrickLink API) for supplementary data like pricing or availability.
8. THE App SHALL store the full synced Catalog data locally to enable offline browsing of all previously synchronized parts and sets.
9. THE App SHALL display the date and time of the last successful Catalog synchronization in the App settings or About screen.

### Requirement 10: Search and Filtering

**User Story:** As a User, I want to search and filter across my Inventory, Collection, MOCs, and Rebuild Ideas, so that I can quickly find what I need.

#### Acceptance Criteria

1. WHEN a User enters a search query of at least 2 characters, THE App SHALL return results matching by name, part number, set number, theme, or designer across the User's Inventory, Collection, MOCs, and Rebuild_Ideas.
2. THE App SHALL display search results within 2 seconds for queries against the local Inventory and Collection, and within 10 seconds for queries against remote data sources (such as MOCs from a Data_Provider).
3. WHEN a User applies multiple filters simultaneously, THE App SHALL combine filters using AND logic and display matching results.
4. THE App SHALL preserve applied filters until the User explicitly clears them or navigates away from the search context.
5. IF a search query or filter combination returns no matching results, THEN THE App SHALL display a message indicating no results were found and suggest broadening the search criteria.
6. IF a remote Data_Provider is unavailable during a search, THEN THE App SHALL display results from locally cached data and indicate that remote results are temporarily unavailable.
7. THE App SHALL limit displayed search results to a maximum of 50 items per domain (Inventory, Collection, MOCs, Rebuild_Ideas) and provide pagination or a load-more mechanism to access additional results.

### Requirement 11: Legal Compliance and Attribution

**User Story:** As a User, I want the App to operate within legal boundaries, so that I can use it without concern about intellectual property issues.

#### Acceptance Criteria

1. THE App SHALL display a disclaimer stating the App is not affiliated with, endorsed by, or sponsored by the LEGO Group, accessible from every screen via a persistent "About" or "Legal" link, and visible in full on the App's About screen without requiring scrolling.
2. THE App SHALL provide attribution to all third-party Data_Providers used for Catalog data by displaying the Data_Provider name and a hyperlink to the Data_Provider's website on any screen that presents data sourced from that provider, and on the App's About screen.
3. THE App SHALL use the term "LEGO" only in descriptive references to the product (e.g., "compatible with LEGO bricks") and SHALL NOT include "LEGO" in the App name, logo, icon, or any branding element displayed to the User.
4. WHEN the term "LEGO" appears in User-facing text within the App, THE App SHALL display it in uppercase ("LEGO") and accompany it at least once per screen with an acknowledgment that LEGO is a trademark of the LEGO Group.
