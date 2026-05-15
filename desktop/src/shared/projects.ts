export interface Project {
  id: string;
  path: string;
}

export interface CreateProjectInput {
  id?: string;
  path: string;
}

export interface UpdateProjectInput {
  id: string;
  path: string;
}
